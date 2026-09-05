
const U={
  service:"7e7a0001-8a5c-4d21-9b44-12d0a35d0001",
  status :"7e7a0002-8a5c-4d21-9b44-12d0a35d0001",
  radar  :"7e7a0003-8a5c-4d21-9b44-12d0a35d0001",
  gps    :"7e7a0004-8a5c-4d21-9b44-12d0a35d0001",
  cmd    :"7e7a0005-8a5c-4d21-9b44-12d0a35d0001"
};

let device,server,service,statusChr,radarChr,gpsChr,cmdChr;
let logging=false,lastStatus={};
let track=JSON.parse(localStorage.getItem("adas_track")||"[]");

const $=id=>document.getElementById(id);
const dec=new TextDecoder(),enc=new TextEncoder();

function log(msg){
  $("log").textContent=`[${new Date().toLocaleTimeString()}] ${msg}\n`+$("log").textContent;
}

function riskText(r){
  r=Number(r||0);
  if(r>=3)return "CRITICAL";
  if(r===2)return "DANGER";
  if(r===1)return "CAUTION";
  return "SAFE";
}

function updateStatus(d){
  lastStatus=d;
  $("risk").textContent=riskText(d.risk);
  $("risk").className=`risk${Number(d.risk||0)}`;
  $("targets").textContent=d.targets??"—";
  $("distance").textContent=d.distance_m!=null?`${d.distance_m} m`:"—";
  $("closing").textContent=d.closing_kmh!=null?`${d.closing_kmh} km/h`:"—";
  $("angle").textContent=d.angle_deg!=null?`${d.angle_deg}°`:"—";
  $("snr").textContent=d.snr??"—";
  $("ttc").textContent=d.ttc_s==null?"—":`${Number(d.ttc_s).toFixed(2)} s`;

  if(d.radar_fw) log(`Radar FW: ${d.radar_fw}`);
  if(d.reply) log(`Reply: ${d.reply}`);
}

function updateGps(d){
  $("fix").textContent=d.fix?"OK":"NO FIX";
  $("sats").textContent=d.sats??"—";
  $("speed").textContent=d.speed_kmh!=null?`${d.speed_kmh} km/h`:"—";
  $("coords").textContent=d.lat!=null?`${Number(d.lat).toFixed(6)}, ${Number(d.lon).toFixed(6)}`:"—";
  if(d.fix && d.lat!=null && d.lon!=null) handleGps(d);
}

const map=L.map("map").setView([10.8231,106.6297],13);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
  maxZoom:19,attribution:"© OpenStreetMap contributors"
}).addTo(map);
let marker=null,line=null,eventLayer=null;

function handleGps(g){
  const lat=Number(g.lat),lon=Number(g.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return;

  if(marker)marker.setLatLng([lat,lon]);
  else marker=L.circleMarker([lat,lon],{radius:7}).addTo(map).bindTooltip("Xe");

  if(logging){
    track.push({
      t:new Date().toISOString(),lat,lon,
      speed_kmh:Number(g.speed_kmh||0),sats:Number(g.sats||0),
      ...lastStatus
    });
    localStorage.setItem("adas_track",JSON.stringify(track));
    drawTrack();
  }
}

function drawTrack(){
  if(line)line.remove();
  if(eventLayer)eventLayer.remove();

  line=L.polyline(track.map(p=>[p.lat,p.lon]),{weight:4}).addTo(map);
  eventLayer=L.layerGroup().addTo(map);

  track.filter(p=>Number(p.risk||0)>=2).forEach(p=>{
    L.circleMarker([p.lat,p.lon],{
      radius:Number(p.risk)>=3?7:5,weight:2
    }).bindPopup(
      `<b>${riskText(p.risk)}</b><br>`+
      `Speed: ${p.speed_kmh??"—"} km/h<br>`+
      `Radar: ${p.distance_m??"—"} m<br>`+
      `Closing: ${p.closing_kmh??"—"} km/h<br>`+
      `TTC: ${p.ttc_s??"—"} s<br>`+
      `${new Date(p.t).toLocaleString()}`
    ).addTo(eventLayer);
  });
  $("tripInfo").textContent=`${track.length} điểm`;
}
drawTrack();

function parseJsonValue(evt){
  const txt=dec.decode(evt.target.value);
  try{return JSON.parse(txt)}catch(e){log(`JSON lỗi: ${txt}`);return null}
}

async function connectBle(){
  if(!navigator.bluetooth){
    alert("Trình duyệt này không hỗ trợ Web Bluetooth.");
    return;
  }
  try{
    device=await navigator.bluetooth.requestDevice({
      filters:[{services:[U.service]}],
      optionalServices:[U.service]
    });
    device.addEventListener("gattserverdisconnected",onDisconnected);

    server=await device.gatt.connect();
    service=await server.getPrimaryService(U.service);
    [statusChr,radarChr,gpsChr,cmdChr]=await Promise.all([
      service.getCharacteristic(U.status),
      service.getCharacteristic(U.radar),
      service.getCharacteristic(U.gps),
      service.getCharacteristic(U.cmd)
    ]);

    await statusChr.startNotifications();
    statusChr.addEventListener("characteristicvaluechanged",e=>{
      const d=parseJsonValue(e);if(d)updateStatus(d);
    });

    await gpsChr.startNotifications();
    gpsChr.addEventListener("characteristicvaluechanged",e=>{
      const d=parseJsonValue(e);if(d)updateGps(d);
    });

    // Radar characteristic now supports NOTIFY in new firmware.
    try{
      await radarChr.startNotifications();
      radarChr.addEventListener("characteristicvaluechanged",e=>{
        const d=parseJsonValue(e);if(d)fillConfig(d);
      });
    }catch(e){
      log("Radar config notify chưa có, vẫn dùng read/write được.");
    }

    const s=JSON.parse(dec.decode(await statusChr.readValue()));
    updateStatus(s);

    const g=JSON.parse(dec.decode(await gpsChr.readValue()));
    updateGps(g);

    await readConfigLocal();

    $("bleDot").className="dot on";
    $("bleState").textContent=`Đã kết nối ${device.name||""}`;
    $("connect").disabled=true;
    ["disconnect","readcfg","writecfg","fw","ping"].forEach(id=>$(id).disabled=false);
    log("BLE connected");
  }catch(e){
    log(`BLE error: ${e.message}`);
  }
}

function onDisconnected(){
  $("bleDot").className="dot off";
  $("bleState").textContent="Mất kết nối";
  $("connect").disabled=false;
  ["disconnect","readcfg","writecfg","fw","ping"].forEach(id=>$(id).disabled=true);
  log("BLE disconnected");
}

function fillConfig(d){
  if(d.range_m!=null)$("range").value=d.range_m;
  if(d.direction!=null)$("direction").value=String(d.direction);
  if(d.min_speed_kmh!=null)$("minSpeed").value=d.min_speed_kmh;
  if(d.delay_s!=null)$("delayS").value=d.delay_s;
  if(d.trigger_count!=null)$("triggerCount").value=d.trigger_count;
  if(d.snr_threshold!=null)$("snrThreshold").value=String(d.snr_threshold);
  if(d.ttc_warn!=null)$("warn").value=d.ttc_warn;
  if(d.ttc_critical!=null)$("critical").value=d.ttc_critical;
}

async function readConfigLocal(){
  if(!radarChr)return;
  try{
    const d=JSON.parse(dec.decode(await radarChr.readValue()));
    fillConfig(d);
    log("Đã đọc config characteristic");
  }catch(e){log(`Read config lỗi: ${e.message}`)}
}

async function requestRadarRead(){
  await sendCmd("RADAR_READ");
  setTimeout(readConfigLocal,500);
}

async function sendConfig(){
  if(!radarChr)return;

  const d={
    range_m:Number($("range").value),
    direction:Number($("direction").value),
    min_speed_kmh:Number($("minSpeed").value),
    delay_s:Number($("delayS").value),
    trigger_count:Number($("triggerCount").value),
    snr_threshold:Number($("snrThreshold").value),
    ttc_warn:Number($("warn").value),
    ttc_critical:Number($("critical").value)
  };

  if(d.range_m<10||d.range_m>100)return alert("Range phải 10..100 m");
  if(d.direction<0||d.direction>2)return alert("Direction không hợp lệ");
  if(d.min_speed_kmh<0||d.min_speed_kmh>120)return alert("Min speed phải 0..120");
  if(d.delay_s<0||d.delay_s>255)return alert("Delay phải 0..255");
  if(d.trigger_count<1||d.trigger_count>10)return alert("Trigger count phải 1..10");
  if(!(d.snr_threshold===0||(d.snr_threshold>=3&&d.snr_threshold<=8)))return alert("SNR threshold: 0 hoặc 3..8");
  if(d.ttc_critical>=d.ttc_warn)return alert("TTC critical phải nhỏ hơn TTC warn");

  const txt=JSON.stringify(d);

  try{
    await radarChr.writeValue(enc.encode(txt));
    log(`Config -> ${txt}`);
    setTimeout(requestRadarRead,700);
  }catch(e){
    log(`Write config lỗi: ${e.message}`);
  }
}

async function sendCmd(cmd){
  if(!cmdChr)return;
  try{
    await cmdChr.writeValue(enc.encode(cmd));
    log(`CMD -> ${cmd}`);
  }catch(e){log(`CMD lỗi: ${e.message}`)}
}

function exportGeo(){
  const features=[];
  if(track.length){
    features.push({
      type:"Feature",
      properties:{kind:"route",points:track.length},
      geometry:{type:"LineString",coordinates:track.map(p=>[p.lon,p.lat])}
    });
  }
  track.forEach(p=>{
    features.push({
      type:"Feature",
      properties:{
        time:p.t,risk:p.risk,risk_label:riskText(p.risk),
        speed_kmh:p.speed_kmh,sats:p.sats,
        targets:p.targets,distance_m:p.distance_m,
        closing_kmh:p.closing_kmh,angle_deg:p.angle_deg,
        snr:p.snr,ttc_s:p.ttc_s
      },
      geometry:{type:"Point",coordinates:[p.lon,p.lat]}
    });
  });

  const blob=new Blob(
    [JSON.stringify({type:"FeatureCollection",features},null,2)],
    {type:"application/geo+json"}
  );
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`adas-trip-${new Date().toISOString().replace(/[:.]/g,"-")}.geojson`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

$("connect").onclick=connectBle;
$("disconnect").onclick=()=>device?.gatt?.disconnect();
$("readcfg").onclick=requestRadarRead;
$("writecfg").onclick=sendConfig;
$("fw").onclick=()=>sendCmd("RADAR_FW");
$("ping").onclick=()=>sendCmd("PING");

$("start").onclick=()=>{
  logging=true;$("start").disabled=true;$("stop").disabled=false;log("Logging ON");
};
$("stop").onclick=()=>{
  logging=false;$("start").disabled=false;$("stop").disabled=true;log("Logging OFF");
};
$("clear").onclick=()=>{
  if(confirm("Xóa toàn bộ log?")){
    track=[];localStorage.removeItem("adas_track");drawTrack();log("Đã xóa log");
  }
};
$("export").onclick=exportGeo;
$("center").onclick=()=>{
  if(marker)map.setView(marker.getLatLng(),17);
  else if(track.length)map.setView([track.at(-1).lat,track.at(-1).lon],17);
};

log("Web v2 ready");
