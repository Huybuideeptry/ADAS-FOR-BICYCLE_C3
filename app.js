const U={
  service:"7e7a0001-8a5c-4d21-9b44-12d0a35d0001",
  status:"7e7a0002-8a5c-4d21-9b44-12d0a35d0001",
  radar:"7e7a0003-8a5c-4d21-9b44-12d0a35d0001",
  gps:"7e7a0004-8a5c-4d21-9b44-12d0a35d0001",
  cmd:"7e7a0005-8a5c-4d21-9b44-12d0a35d0001",
  otaCtrl:"7e7a0006-8a5c-4d21-9b44-12d0a35d0001",
  otaData:"7e7a0007-8a5c-4d21-9b44-12d0a35d0001",
  otaStat:"7e7a0008-8a5c-4d21-9b44-12d0a35d0001",
  link:"7e7a0009-8a5c-4d21-9b44-12d0a35d0001"
};

let device,server,service,statusChr,radarChr,gpsChr,cmdChr;
let otaCtrlChr,otaDataChr,otaStatChr,linkChr;
let logging=false,lastStatus={};
let track=JSON.parse(localStorage.getItem("adas_track")||"[]");
let otaRunning=false,otaDeviceReceived=0,otaDeviceState="idle";
let currentBleRssi=0;

const $=id=>document.getElementById(id);
const dec=new TextDecoder(),enc=new TextEncoder();

function log(m){
  $("log").textContent=`[${new Date().toLocaleTimeString()}] ${m}\n`+$("log").textContent;
}

function riskText(r){
  r=Number(r||0);
  return r>=3?"KHẨN CẤP":r===2?"NGUY HIỂM":r===1?"CHÚ Ý":"AN TOÀN";
}

function updateStatus(d){
  lastStatus=d;
  $("risk").textContent=riskText(d.risk);
  $("risk").className=`risk-badge risk${Number(d.risk||0)}`;
  $("targets").textContent=d.targets??"—";
  $("distance").textContent=d.distance_m!=null?`${d.distance_m} m`:"—";
  $("closing").textContent=d.closing_kmh!=null?`${d.closing_kmh} km/h`:"—";
  $("angle").textContent=d.angle_deg!=null?`${d.angle_deg}°`:"—";
  $("snr").textContent=d.snr??"—";
  $("ttc").textContent=d.ttc_s==null?"—":`${Number(d.ttc_s).toFixed(2)} s`;
  if(d.radar_fw) log(`Phiên bản LD2451: ${d.radar_fw}`);
  if(d.reply) log(`Phản hồi: ${d.reply}`);
}

function updateGps(d){
  $("fix").textContent=d.fix?"OK":"CHƯA";
  $("sats").textContent=d.sats??"—";
  $("speed").textContent=d.speed_kmh!=null?`${d.speed_kmh} km/h`:"—";
  $("coords").textContent=d.lat!=null?`${Number(d.lat).toFixed(6)}, ${Number(d.lon).toFixed(6)}`:"—";
  if(d.fix&&d.lat!=null&&d.lon!=null) handleGps(d);
}

const map=L.map("map").setView([10.8231,106.6297],13);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
  maxZoom:19,
  attribution:"© OpenStreetMap contributors"
}).addTo(map);

let marker=null,line=null;

function handleGps(g){
  const lat=Number(g.lat),lon=Number(g.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)) return;

  if(marker) marker.setLatLng([lat,lon]);
  else marker=L.circleMarker([lat,lon],{radius:7}).addTo(map);

  if(logging){
    track.push({
      t:new Date().toISOString(),
      lat,lon,
      speed_kmh:Number(g.speed_kmh||0),
      sats:Number(g.sats||0),
      ...lastStatus
    });
    localStorage.setItem("adas_track",JSON.stringify(track));
    drawTrack();
  }
}

function drawTrack(){
  if(line) line.remove();
  line=L.polyline(track.map(p=>[p.lat,p.lon]),{weight:4}).addTo(map);
  $("tripInfo").textContent=`${track.length} điểm`;
}
drawTrack();

function parse(evt){
  try{
    return JSON.parse(dec.decode(evt.target.value));
  }catch(e){
    log("Lỗi đọc JSON BLE");
    return null;
  }
}

function fillConfig(d){
  if(d.range_m!=null) $("range").value=d.range_m;
  if(d.direction!=null) $("direction").value=d.direction;
  if(d.min_speed_kmh!=null) $("minSpeed").value=d.min_speed_kmh;
  if(d.delay_s!=null) $("delayS").value=d.delay_s;
  if(d.trigger_count!=null) $("triggerCount").value=d.trigger_count;
  if(d.snr_threshold!=null) $("snrThreshold").value=d.snr_threshold;
  if(d.ttc_warn!=null) $("warn").value=d.ttc_warn;
  if(d.ttc_critical!=null) $("critical").value=d.ttc_critical;
}

function updateBleSignal(d){
  const r=Number(d.rssi_dbm||0);
  currentBleRssi=r;
  const el=$("bleSignal");
  if(!el) return;

  if(!r){
    el.textContent="— dBm";
    el.className="signal-text";
    return;
  }

  let label=r>=-55?"Rất tốt":r>=-67?"Tốt":r>=-75?"Trung bình":"Yếu";
  el.textContent=`${r} dBm · ${label}`;
  el.className="signal-text "+(r>=-67?"signal-good":r>=-75?"signal-mid":"signal-weak");
}

async function connectBle(){
  try{
    device=await navigator.bluetooth.requestDevice({
      filters:[{services:[U.service]}]
    });

    device.addEventListener("gattserverdisconnected",onDisc);
    server=await device.gatt.connect();
    service=await server.getPrimaryService(U.service);

    [
      statusChr,radarChr,gpsChr,cmdChr,
      otaCtrlChr,otaDataChr,otaStatChr,linkChr
    ]=await Promise.all([
      service.getCharacteristic(U.status),
      service.getCharacteristic(U.radar),
      service.getCharacteristic(U.gps),
      service.getCharacteristic(U.cmd),
      service.getCharacteristic(U.otaCtrl),
      service.getCharacteristic(U.otaData),
      service.getCharacteristic(U.otaStat),
      service.getCharacteristic(U.link)
    ]);

    await statusChr.startNotifications();
    statusChr.addEventListener("characteristicvaluechanged",e=>{
      const d=parse(e);
      if(d) updateStatus(d);
    });

    await gpsChr.startNotifications();
    gpsChr.addEventListener("characteristicvaluechanged",e=>{
      const d=parse(e);
      if(d) updateGps(d);
    });

    await otaStatChr.startNotifications();
    otaStatChr.addEventListener("characteristicvaluechanged",onOtaStatus);

    await linkChr.startNotifications();
    linkChr.addEventListener("characteristicvaluechanged",e=>{
      const d=parse(e);
      if(d) updateBleSignal(d);
    });

    try{
      const d=JSON.parse(dec.decode(await linkChr.readValue()));
      updateBleSignal(d);
    }catch{}

    updateStatus(JSON.parse(dec.decode(await statusChr.readValue())));
    updateGps(JSON.parse(dec.decode(await gpsChr.readValue())));
    fillConfig(JSON.parse(dec.decode(await radarChr.readValue())));

    $("bleDot").className="dot on";
    $("bleState").textContent=`Đã kết nối ${device.name||""}`;
    $("connect").disabled=true;

    ["disconnect","readcfg","writecfg","fw","ping","otaStart"].forEach(id=>{
      $(id).disabled=false;
    });

    $("otaState").textContent="Thiết bị đã sẵn sàng OTA.";
    log("BLE connected");
  }catch(e){
    log("BLE lỗi: "+e.message);
  }
}

function onDisc(){
  $("bleDot").className="dot off";
  $("bleState").textContent="Mất kết nối";

  if($("bleSignal")){
    $("bleSignal").textContent="— dBm";
    $("bleSignal").className="signal-text";
  }

  $("connect").disabled=false;

  ["disconnect","readcfg","writecfg","fw","ping","otaStart","otaAbort"].forEach(id=>{
    $(id).disabled=true;
  });

  $("otaState").textContent="Đã mất kết nối BLE.";
  otaRunning=false;
  log("BLE disconnected");
}

async function cmd(s){
  await cmdChr.writeValue(enc.encode(s));
  log("CMD -> "+s);
}

$("connect").onclick=connectBle;
$("disconnect").onclick=()=>device?.gatt?.disconnect();
$("ping").onclick=()=>cmd("PING");
$("fw").onclick=()=>cmd("RADAR_FW");

$("readcfg").onclick=async()=>{
  try{
    await cmd("RADAR_READ");
    await new Promise(r=>setTimeout(r,400));
    const d=JSON.parse(dec.decode(await radarChr.readValue()));
    fillConfig(d);
    log("Đã đọc cấu hình LD2451");
  }catch(e){
    log("Lỗi đọc cấu hình: "+e.message);
  }
};

$("writecfg").onclick=async()=>{
  try{
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

    if(d.range_m<10||d.range_m>100) return alert("Tầm phát hiện phải từ 10 đến 100 m.");
    if(d.direction<0||d.direction>2) return alert("Hướng mục tiêu không hợp lệ.");
    if(d.min_speed_kmh<0||d.min_speed_kmh>120) return alert("Tốc độ tối thiểu phải từ 0 đến 120 km/h.");
    if(d.delay_s<0||d.delay_s>255) return alert("Thời gian giữ phải từ 0 đến 255 giây.");
    if(d.trigger_count<1||d.trigger_count>10) return alert("Số lần kích hoạt phải từ 1 đến 10.");
    if(!(d.snr_threshold===0||(d.snr_threshold>=3&&d.snr_threshold<=8))) return alert("Ngưỡng SNR phải là 0 hoặc từ 3 đến 8.");
    if(d.ttc_critical>=d.ttc_warn) return alert("TTC khẩn cấp phải nhỏ hơn TTC cảnh báo.");

    await radarChr.writeValue(enc.encode(JSON.stringify(d)));
    log("Đã gửi cấu hình LD2451");
  }catch(e){
    log("Lỗi gửi cấu hình: "+e.message);
  }
};

$("start").onclick=()=>{
  logging=true;
  $("start").disabled=true;
  $("stop").disabled=false;
  log("Bắt đầu ghi hành trình");
};

$("stop").onclick=()=>{
  logging=false;
  $("start").disabled=false;
  $("stop").disabled=true;
  log("Đã dừng ghi hành trình");
};

$("clear").onclick=()=>{
  if(!confirm("Xóa toàn bộ dữ liệu hành trình?")) return;
  track=[];
  localStorage.removeItem("adas_track");
  drawTrack();
  log("Đã xóa dữ liệu hành trình");
};

$("center").onclick=()=>{
  if(marker) map.setView(marker.getLatLng(),17);
  else if(track.length){
    const p=track[track.length-1];
    map.setView([p.lat,p.lon],17);
  }
};

$("export").onclick=()=>{
  const features=[];

  if(track.length){
    features.push({
      type:"Feature",
      properties:{kind:"route",points:track.length},
      geometry:{
        type:"LineString",
        coordinates:track.map(p=>[p.lon,p.lat])
      }
    });
  }

  track.forEach(p=>{
    features.push({
      type:"Feature",
      properties:{
        time:p.t,
        risk:p.risk,
        risk_label:riskText(p.risk),
        speed_kmh:p.speed_kmh,
        sats:p.sats,
        targets:p.targets,
        distance_m:p.distance_m,
        closing_kmh:p.closing_kmh,
        angle_deg:p.angle_deg,
        snr:p.snr,
        ttc_s:p.ttc_s
      },
      geometry:{
        type:"Point",
        coordinates:[p.lon,p.lat]
      }
    });
  });

  const blob=new Blob([
    JSON.stringify({type:"FeatureCollection",features},null,2)
  ],{type:"application/geo+json"});

  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`adas-trip-${new Date().toISOString().replace(/[:.]/g,"-")}.geojson`;
  a.click();

  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};

function crc32(buf){
  let c=0^(-1);
  const a=new Uint8Array(buf);

  for(let n=0;n<a.length;n++){
    c^=a[n];
    for(let k=0;k<8;k++){
      c=(c>>>1)^((c&1)?0xEDB88320:0);
    }
  }

  return(c^(-1))>>>0;
}

$("fwFile").onchange=()=>{
  const f=$("fwFile").files[0];

  if(!f){
    $("fwMeta").textContent="Chưa chọn file firmware.";
    return;
  }

  $("fwMeta").textContent=`${f.name} · ${(f.size/1024).toFixed(1)} KB`;
};

function onOtaStatus(e){
  const d=parse(e);
  if(!d) return;

  otaDeviceState=d.state||otaDeviceState;
  if(d.received!=null) otaDeviceReceived=Number(d.received);

  if(d.percent!=null){
    $("otaBar").style.width=`${Math.min(100,d.percent)}%`;
    $("otaPercent").textContent=`${Number(d.percent).toFixed(1)}%`;
  }

  if(d.kbps!=null){
    $("otaSpeed").textContent=`${Number(d.kbps).toFixed(1)} KB/s`;
  }

  if(d.received!=null){
    $("otaBytes").textContent=`${(d.received/1024).toFixed(1)} KB`;
  }

  if(d.message){
    $("otaState").textContent=d.message;
  }

  if(d.state==="success"){
    $("otaState").textContent="Cập nhật thành công. Thiết bị đang khởi động lại...";
    otaRunning=false;
    $("otaAbort").disabled=true;
  }

  if(d.state==="error"){
    $("otaState").textContent="Lỗi OTA: "+(d.message||"không rõ");
    otaRunning=false;
    $("otaStart").disabled=false;
    $("otaAbort").disabled=true;
  }
}

async function otaUpload(){
  if(otaRunning) return;

  const f=$("fwFile").files[0];
  if(!f) return alert("Chọn file .bin trước.");
  if(!f.name.toLowerCase().endsWith(".bin")) return alert("Chỉ chấp nhận file .bin.");
  if(!confirm(`Cập nhật firmware ${f.name} (${(f.size/1024).toFixed(1)} KB)?`)) return;

  const buf=await f.arrayBuffer();
  const crc=crc32(buf);
  const bytes=new Uint8Array(buf);

  otaRunning=true;
  otaDeviceReceived=0;
  otaDeviceState="starting";

  $("otaStart").disabled=true;
  $("otaAbort").disabled=false;
  $("otaState").textContent="Đang chuẩn bị vùng OTA...";
  $("otaBar").style.width="0%";
  $("otaPercent").textContent="0%";
  $("otaSpeed").textContent="0 KB/s";
  $("otaBytes").textContent="0 KB";
  $("otaTime").textContent="0.0 s";

  await otaCtrlChr.writeValue(
    enc.encode(`START {"size":${f.size},"crc32":${crc}}`)
  );

  const readyStart=performance.now();

  while(
    otaRunning &&
    otaDeviceState!=="ready" &&
    performance.now()-readyStart<3000
  ){
    await new Promise(r=>setTimeout(r,25));
  }

  if(!otaRunning) throw new Error("Đã hủy OTA");

  // OTA cố định, không adaptive theo RSSI
  const chunk=180;
  const windowPackets=4;
  const pacingMs=10;
  const maxOutstanding=3072;
  const resumeOutstanding=1536;

  let sent=0;
  const started=performance.now();
  let lastUi=started;
  let lastDeviceReceived=0;
  let lastProgressAt=performance.now();

  while(sent<bytes.length){
    if(!otaRunning) throw new Error("Đã hủy OTA");
    if(!device?.gatt?.connected) throw new Error("Đã mất kết nối BLE");

    if(sent-otaDeviceReceived>maxOutstanding){
      while(
        otaRunning &&
        device?.gatt?.connected &&
        sent-otaDeviceReceived>resumeOutstanding
      ){
        if(otaDeviceReceived!==lastDeviceReceived){
          lastDeviceReceived=otaDeviceReceived;
          lastProgressAt=performance.now();
        }

        if(performance.now()-lastProgressAt>4000){
          throw new Error(
            `OTA bị đứng: ESP32-C3 dừng ở ${(otaDeviceReceived/1024).toFixed(1)} KB`
          );
        }

        await new Promise(r=>setTimeout(r,15));
      }
    }

    let packets=0;

    while(packets<windowPackets&&sent<bytes.length){
      const n=Math.min(chunk,bytes.length-sent);
      const part=bytes.slice(sent,sent+n);

      if(typeof otaDataChr.writeValueWithoutResponse==="function"){
        await otaDataChr.writeValueWithoutResponse(part);
      }else{
        await otaDataChr.writeValue(part);
      }

      sent+=n;
      packets++;
    }

    await new Promise(r=>setTimeout(r,pacingMs));

    if(otaDeviceReceived!==lastDeviceReceived){
      lastDeviceReceived=otaDeviceReceived;
      lastProgressAt=performance.now();
    }

    const now=performance.now();

    if(now-lastUi>100||sent===bytes.length){
      lastUi=now;

      const sec=(now-started)/1000;
      const speed=(otaDeviceReceived/1024)/Math.max(sec,0.001);
      const pct=100*otaDeviceReceived/bytes.length;

      $("otaBar").style.width=Math.min(100,pct)+"%";
      $("otaPercent").textContent=Math.min(100,pct).toFixed(1)+"%";
      $("otaSpeed").textContent=speed.toFixed(1)+" KB/s";
      $("otaBytes").textContent=(otaDeviceReceived/1024).toFixed(1)+" KB";
      $("otaTime").textContent=sec.toFixed(1)+" s";

      const rssi=currentBleRssi?`${currentBleRssi} dBm`:"— dBm";

      $("otaState").textContent=
        `Đang cập nhật... ${rssi} · window 4 · hàng đợi ${(Math.max(0,sent-otaDeviceReceived)/1024).toFixed(1)} KB`;
    }
  }

  $("otaState").textContent=
    "Đã gửi hết từ trình duyệt, đang chờ ESP32-C3 ghi nốt...";

  const drainStart=performance.now();

  while(
    otaRunning &&
    device?.gatt?.connected &&
    otaDeviceReceived<bytes.length
  ){
    if(otaDeviceReceived!==lastDeviceReceived){
      lastDeviceReceived=otaDeviceReceived;
      lastProgressAt=performance.now();
    }

    if(performance.now()-lastProgressAt>4000){
      throw new Error(
        `OTA bị đứng khi chờ ghi nốt: ${otaDeviceReceived}/${bytes.length} byte`
      );
    }

    if(performance.now()-drainStart>15000){
      throw new Error(
        `Hết thời gian chờ: ESP32-C3 mới nhận ${otaDeviceReceived}/${bytes.length} byte`
      );
    }

    await new Promise(r=>setTimeout(r,25));
  }

  if(otaDeviceReceived!==bytes.length){
    throw new Error(
      `ESP32-C3 mới nhận ${otaDeviceReceived}/${bytes.length} byte`
    );
  }

  await otaCtrlChr.writeValue(enc.encode("END"));

  const sec=(performance.now()-started)/1000;
  const speed=(bytes.length/1024)/sec;

  log(
    `OTA hoàn tất: ${(bytes.length/1024).toFixed(1)} KB / ${sec.toFixed(1)} s = ${speed.toFixed(1)} KB/s`
  );

  $("otaState").textContent=
    "ESP32-C3 đang kiểm tra CRC32 và kích hoạt firmware...";
}

$("otaStart").onclick=()=>{
  otaUpload().catch(async e=>{
    log("OTA lỗi: "+e.message);
    $("otaState").textContent="OTA lỗi: "+e.message;
    otaRunning=false;
    $("otaStart").disabled=false;
    $("otaAbort").disabled=true;

    try{
      await otaCtrlChr.writeValue(enc.encode("ABORT"));
    }catch{}
  });
};

$("otaAbort").onclick=async()=>{
  otaRunning=false;

  try{
    await otaCtrlChr.writeValue(enc.encode("ABORT"));
  }catch{}

  $("otaState").textContent="Đã hủy OTA.";
  $("otaStart").disabled=false;
  $("otaAbort").disabled=true;
};

log("Web BLE OTA ready");
