const U = {
  service: "7e7a0001-8a5c-4d21-9b44-12d0a35d0001",
  status: "7e7a0002-8a5c-4d21-9b44-12d0a35d0001",
  radar: "7e7a0003-8a5c-4d21-9b44-12d0a35d0001",
  gps: "7e7a0004-8a5c-4d21-9b44-12d0a35d0001",
  cmd: "7e7a0005-8a5c-4d21-9b44-12d0a35d0001",

  otaCtrl: "7e7a0006-8a5c-4d21-9b44-12d0a35d0001",
  otaData: "7e7a0007-8a5c-4d21-9b44-12d0a35d0001",
  otaStat: "7e7a0008-8a5c-4d21-9b44-12d0a35d0001"
};


let device;
let server;
let service;

let statusChr;
let radarChr;
let gpsChr;
let cmdChr;

let otaCtrlChr;
let otaDataChr;
let otaStatChr;


let logging = false;
let lastStatus = {};

let track = JSON.parse(
  localStorage.getItem("adas_track") || "[]"
);

let otaRunning = false;


const $ = id =>
  document.getElementById(id);

const dec = new TextDecoder();
const enc = new TextEncoder();


// ============================================================
// LOG
// ============================================================

function log(message) {

  $("log").textContent =
    `[${new Date().toLocaleTimeString()}] ${message}\n`
    + $("log").textContent;

}


// ============================================================
// RISK
// ============================================================

function riskText(risk) {

  risk = Number(risk || 0);

  if (risk >= 3) {
    return "KHẨN CẤP";
  }

  if (risk === 2) {
    return "NGUY HIỂM";
  }

  if (risk === 1) {
    return "CHÚ Ý";
  }

  return "AN TOÀN";
}


function updateStatus(data) {

  lastStatus = data;

  $("risk").textContent =
    riskText(data.risk);

  $("risk").className =
    `risk-badge risk${Number(data.risk || 0)}`;

  $("targets").textContent =
    data.targets ?? "—";

  $("distance").textContent =
    data.distance_m != null
      ? `${data.distance_m} m`
      : "—";

  $("closing").textContent =
    data.closing_kmh != null
      ? `${data.closing_kmh} km/h`
      : "—";

  $("angle").textContent =
    data.angle_deg != null
      ? `${data.angle_deg}°`
      : "—";

  $("snr").textContent =
    data.snr ?? "—";

  $("ttc").textContent =
    data.ttc_s == null
      ? "—"
      : `${Number(data.ttc_s).toFixed(2)} s`;


  if (data.radar_fw) {

    log(
      `Phiên bản LD2451: ${data.radar_fw}`
    );

  }


  if (data.reply) {

    log(
      `Phản hồi: ${data.reply}`
    );

  }

}


// ============================================================
// GPS
// ============================================================

function updateGps(data) {

  $("fix").textContent =
    data.fix
      ? "OK"
      : "CHƯA";

  $("sats").textContent =
    data.sats ?? "—";

  $("speed").textContent =
    data.speed_kmh != null
      ? `${data.speed_kmh} km/h`
      : "—";

  $("coords").textContent =
    data.lat != null
      ? `${Number(data.lat).toFixed(6)}, ${Number(data.lon).toFixed(6)}`
      : "—";


  if (
    data.fix &&
    data.lat != null &&
    data.lon != null
  ) {

    handleGps(data);

  }

}


// ============================================================
// MAP
// ============================================================

const map = L
  .map("map")
  .setView(
    [10.8231, 106.6297],
    13
  );


L.tileLayer(
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution:
      "© OpenStreetMap contributors"
  }
).addTo(map);


let marker = null;
let line = null;


function handleGps(gps) {

  const lat = Number(gps.lat);
  const lon = Number(gps.lon);


  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {

    return;

  }


  if (marker) {

    marker.setLatLng(
      [lat, lon]
    );

  }

  else {

    marker = L
      .circleMarker(
        [lat, lon],
        {
          radius: 7
        }
      )
      .addTo(map);

  }


  if (logging) {

    track.push({

      t:
        new Date().toISOString(),

      lat,
      lon,

      speed_kmh:
        Number(gps.speed_kmh || 0),

      sats:
        Number(gps.sats || 0),

      ...lastStatus

    });


    localStorage.setItem(
      "adas_track",
      JSON.stringify(track)
    );


    drawTrack();

  }

}


function drawTrack() {

  if (line) {

    line.remove();

  }


  line = L
    .polyline(
      track.map(
        point => [
          point.lat,
          point.lon
        ]
      ),
      {
        weight: 4
      }
    )
    .addTo(map);


  $("tripInfo").textContent =
    `${track.length} điểm`;

}


drawTrack();


// ============================================================
// BLE JSON
// ============================================================

function parseJsonEvent(event) {

  try {

    return JSON.parse(
      dec.decode(
        event.target.value
      )
    );

  }

  catch (error) {

    log(
      "Lỗi đọc JSON BLE"
    );

    return null;

  }

}


// ============================================================
// RADAR CONFIG UI
// ============================================================

function fillConfig(data) {

  if (data.range_m != null) {
    $("range").value =
      data.range_m;
  }


  if (data.direction != null) {
    $("direction").value =
      data.direction;
  }


  if (data.min_speed_kmh != null) {
    $("minSpeed").value =
      data.min_speed_kmh;
  }


  if (data.delay_s != null) {
    $("delayS").value =
      data.delay_s;
  }


  if (data.trigger_count != null) {
    $("triggerCount").value =
      data.trigger_count;
  }


  if (data.snr_threshold != null) {
    $("snrThreshold").value =
      data.snr_threshold;
  }


  if (data.ttc_warn != null) {
    $("warn").value =
      data.ttc_warn;
  }


  if (data.ttc_critical != null) {
    $("critical").value =
      data.ttc_critical;
  }

}


// ============================================================
// CONNECT BLE
// ============================================================

async function connectBle() {

  try {

    device =
      await navigator.bluetooth.requestDevice({

        filters: [
          {
            services: [
              U.service
            ]
          }
        ]

      });


    device.addEventListener(
      "gattserverdisconnected",
      onDisconnected
    );


    server =
      await device.gatt.connect();


    service =
      await server.getPrimaryService(
        U.service
      );


    [
      statusChr,
      radarChr,
      gpsChr,
      cmdChr,
      otaCtrlChr,
      otaDataChr,
      otaStatChr
    ] = await Promise.all([

      service.getCharacteristic(
        U.status
      ),

      service.getCharacteristic(
        U.radar
      ),

      service.getCharacteristic(
        U.gps
      ),

      service.getCharacteristic(
        U.cmd
      ),

      service.getCharacteristic(
        U.otaCtrl
      ),

      service.getCharacteristic(
        U.otaData
      ),

      service.getCharacteristic(
        U.otaStat
      )

    ]);


    // --------------------------------
    // STATUS NOTIFY
    // --------------------------------

    await statusChr
      .startNotifications();


    statusChr.addEventListener(
      "characteristicvaluechanged",
      event => {

        const data =
          parseJsonEvent(event);

        if (data) {

          updateStatus(data);

        }

      }
    );


    // --------------------------------
    // GPS NOTIFY
    // --------------------------------

    await gpsChr
      .startNotifications();


    gpsChr.addEventListener(
      "characteristicvaluechanged",
      event => {

        const data =
          parseJsonEvent(event);

        if (data) {

          updateGps(data);

        }

      }
    );


    // --------------------------------
    // OTA STATUS
    // --------------------------------

    await otaStatChr
      .startNotifications();


    otaStatChr.addEventListener(
      "characteristicvaluechanged",
      onOtaStatus
    );


    // --------------------------------
    // READ INITIAL DATA
    // --------------------------------

    const statusData =
      JSON.parse(
        dec.decode(
          await statusChr.readValue()
        )
      );


    updateStatus(
      statusData
    );


    const gpsData =
      JSON.parse(
        dec.decode(
          await gpsChr.readValue()
        )
      );


    updateGps(
      gpsData
    );


    const radarData =
      JSON.parse(
        dec.decode(
          await radarChr.readValue()
        )
      );


    fillConfig(
      radarData
    );


    // --------------------------------
    // UI
    // --------------------------------

    $("bleDot").className =
      "dot on";


    $("bleState").textContent =
      `Đã kết nối ${device.name || ""}`;


    $("connect").disabled =
      true;


    [
      "disconnect",
      "readcfg",
      "writecfg",
      "fw",
      "ping",
      "otaStart"
    ].forEach(
      id => {

        $(id).disabled =
          false;

      }
    );


    $("otaState").textContent =
      "Thiết bị đã sẵn sàng OTA.";


    log(
      "BLE connected"
    );

  }

  catch (error) {

    log(
      "BLE lỗi: "
      + error.message
    );

  }

}


// ============================================================
// DISCONNECT
// ============================================================

function onDisconnected() {

  $("bleDot").className =
    "dot off";


  $("bleState").textContent =
    "Mất kết nối";


  $("connect").disabled =
    false;


  [
    "disconnect",
    "readcfg",
    "writecfg",
    "fw",
    "ping",
    "otaStart",
    "otaAbort"
  ].forEach(
    id => {

      $(id).disabled =
        true;

    }
  );


  $("otaState").textContent =
    "Đã mất kết nối BLE.";


  otaRunning =
    false;


  log(
    "BLE disconnected"
  );

}


// ============================================================
// COMMAND
// ============================================================

async function sendCommand(command) {

  if (!cmdChr) {

    return;

  }


  await cmdChr.writeValue(
    enc.encode(
      command
    )
  );


  log(
    `CMD -> ${command}`
  );

}


// ============================================================
// BUTTONS BLE
// ============================================================

$("connect").onclick =
  connectBle;


$("disconnect").onclick =
  () => {

    device?.gatt?.disconnect();

  };


$("ping").onclick =
  () => {

    sendCommand(
      "PING"
    );

  };


$("fw").onclick =
  () => {

    sendCommand(
      "RADAR_FW"
    );

  };


$("readcfg").onclick =
  async () => {

    try {

      await sendCommand(
        "RADAR_READ"
      );


      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            400
          )
      );


      const data =
        JSON.parse(
          dec.decode(
            await radarChr.readValue()
          )
        );


      fillConfig(
        data
      );


      log(
        "Đã đọc cấu hình LD2451"
      );

    }

    catch (error) {

      log(
        "Lỗi đọc cấu hình: "
        + error.message
      );

    }

  };


// ============================================================
// WRITE RADAR CONFIG
// ============================================================

$("writecfg").onclick =
  async () => {

    try {

      const config = {

        range_m:
          Number(
            $("range").value
          ),

        direction:
          Number(
            $("direction").value
          ),

        min_speed_kmh:
          Number(
            $("minSpeed").value
          ),

        delay_s:
          Number(
            $("delayS").value
          ),

        trigger_count:
          Number(
            $("triggerCount").value
          ),

        snr_threshold:
          Number(
            $("snrThreshold").value
          ),

        ttc_warn:
          Number(
            $("warn").value
          ),

        ttc_critical:
          Number(
            $("critical").value
          )

      };


      if (
        config.range_m < 10 ||
        config.range_m > 100
      ) {

        alert(
          "Tầm phát hiện phải từ 10 đến 100 m."
        );

        return;

      }


      if (
        config.direction < 0 ||
        config.direction > 2
      ) {

        alert(
          "Hướng mục tiêu không hợp lệ."
        );

        return;

      }


      if (
        config.min_speed_kmh < 0 ||
        config.min_speed_kmh > 120
      ) {

        alert(
          "Tốc độ tối thiểu phải từ 0 đến 120 km/h."
        );

        return;

      }


      if (
        config.delay_s < 0 ||
        config.delay_s > 255
      ) {

        alert(
          "Thời gian giữ phải từ 0 đến 255 giây."
        );

        return;

      }


      if (
        config.trigger_count < 1 ||
        config.trigger_count > 10
      ) {

        alert(
          "Số lần kích hoạt phải từ 1 đến 10."
        );

        return;

      }


      if (
        !(
          config.snr_threshold === 0 ||
          (
            config.snr_threshold >= 3 &&
            config.snr_threshold <= 8
          )
        )
      ) {

        alert(
          "Ngưỡng SNR phải là 0 hoặc từ 3 đến 8."
        );

        return;

      }


      if (
        config.ttc_critical >=
        config.ttc_warn
      ) {

        alert(
          "TTC khẩn cấp phải nhỏ hơn TTC cảnh báo."
        );

        return;

      }


      await radarChr.writeValue(
        enc.encode(
          JSON.stringify(config)
        )
      );


      log(
        "Đã gửi cấu hình LD2451"
      );

    }

    catch (error) {

      log(
        "Lỗi gửi cấu hình: "
        + error.message
      );

    }

  };


// ============================================================
// TRACK LOG
// ============================================================

$("start").onclick =
  () => {

    logging =
      true;


    $("start").disabled =
      true;


    $("stop").disabled =
      false;


    log(
      "Bắt đầu ghi hành trình"
    );

  };


$("stop").onclick =
  () => {

    logging =
      false;


    $("start").disabled =
      false;


    $("stop").disabled =
      true;


    log(
      "Đã dừng ghi hành trình"
    );

  };


$("clear").onclick =
  () => {

    if (
      !confirm(
        "Xóa toàn bộ dữ liệu hành trình?"
      )
    ) {

      return;

    }


    track = [];


    localStorage.removeItem(
      "adas_track"
    );


    drawTrack();


    log(
      "Đã xóa dữ liệu hành trình"
    );

  };


$("center").onclick =
  () => {

    if (marker) {

      map.setView(
        marker.getLatLng(),
        17
      );

    }

    else if (
      track.length
    ) {

      const point =
        track[
          track.length - 1
        ];


      map.setView(
        [
          point.lat,
          point.lon
        ],
        17
      );

    }

  };


// ============================================================
// EXPORT GEOJSON
// ============================================================

$("export").onclick =
  () => {

    const features = [];


    if (
      track.length
    ) {

      features.push({

        type:
          "Feature",

        properties: {

          kind:
            "route",

          points:
            track.length

        },

        geometry: {

          type:
            "LineString",

          coordinates:
            track.map(
              point => [
                point.lon,
                point.lat
              ]
            )

        }

      });

    }


    track.forEach(
      point => {

        features.push({

          type:
            "Feature",

          properties: {

            time:
              point.t,

            risk:
              point.risk,

            risk_label:
              riskText(
                point.risk
              ),

            speed_kmh:
              point.speed_kmh,

            sats:
              point.sats,

            targets:
              point.targets,

            distance_m:
              point.distance_m,

            closing_kmh:
              point.closing_kmh,

            angle_deg:
              point.angle_deg,

            snr:
              point.snr,

            ttc_s:
              point.ttc_s

          },

          geometry: {

            type:
              "Point",

            coordinates: [
              point.lon,
              point.lat
            ]

          }

        });

      }
    );


    const blob =
      new Blob(
        [
          JSON.stringify(
            {
              type:
                "FeatureCollection",

              features
            },
            null,
            2
          )
        ],
        {
          type:
            "application/geo+json"
        }
      );


    const link =
      document.createElement(
        "a"
      );


    link.href =
      URL.createObjectURL(
        blob
      );


    link.download =
      `adas-trip-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.geojson`;


    link.click();


    setTimeout(
      () => {

        URL.revokeObjectURL(
          link.href
        );

      },
      1000
    );

  };


// ============================================================
// CRC32
// ============================================================

function crc32(buffer) {

  let crc =
    0 ^ (-1);


  const data =
    new Uint8Array(
      buffer
    );


  for (
    let index = 0;
    index < data.length;
    index++
  ) {

    crc ^=
      data[index];


    for (
      let bit = 0;
      bit < 8;
      bit++
    ) {

      crc =
        (crc >>> 1) ^
        (
          (crc & 1)
            ? 0xEDB88320
            : 0
        );

    }

  }


  return (
    crc ^ (-1)
  ) >>> 0;

}


// ============================================================
// FILE SELECT
// ============================================================

$("fwFile").onchange =
  () => {

    const file =
      $("fwFile").files[0];


    if (!file) {

      $("fwMeta").textContent =
        "Chưa chọn file firmware.";

      return;

    }


    $("fwMeta").textContent =
      `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;

  };


// ============================================================
// OTA STATUS FROM ESP32
// ============================================================

function onOtaStatus(event) {

  const data =
    parseJsonEvent(event);


  if (!data) {

    return;

  }


  if (
    data.percent != null
  ) {

    $("otaBar").style.width =
      `${Math.min(
        100,
        data.percent
      )}%`;


    $("otaPercent").textContent =
      `${Number(
        data.percent
      ).toFixed(1)}%`;

  }


  if (
    data.kbps != null
  ) {

    $("otaSpeed").textContent =
      `${Number(
        data.kbps
      ).toFixed(1)} KB/s`;

  }


  if (
    data.received != null
  ) {

    $("otaBytes").textContent =
      `${(
        data.received /
        1024
      ).toFixed(1)} KB`;

  }


  if (
    data.message
  ) {

    $("otaState").textContent =
      data.message;

  }


  if (
    data.state ===
    "success"
  ) {

    $("otaState").textContent =
      "Cập nhật thành công. Thiết bị đang khởi động lại...";


    otaRunning =
      false;


    $("otaAbort").disabled =
      true;

  }


  if (
    data.state ===
    "error"
  ) {

    $("otaState").textContent =
      "Lỗi OTA: "
      + (
        data.message ||
        "không rõ"
      );


    otaRunning =
      false;


    $("otaStart").disabled =
      false;


    $("otaAbort").disabled =
      true;

  }

}


// ============================================================
// OTA UPLOAD
// ============================================================

async function otaUpload() {

  if (
    otaRunning
  ) {

    return;

  }


  const file =
    $("fwFile").files[0];


  if (!file) {

    alert(
      "Chọn file .bin trước."
    );

    return;

  }


  if (
    !file.name
      .toLowerCase()
      .endsWith(".bin")
  ) {

    alert(
      "Chỉ chấp nhận file .bin."
    );

    return;

  }


  const confirmed =
    confirm(
      `Cập nhật firmware ${file.name} (${(file.size / 1024).toFixed(1)} KB)?`
    );


  if (
    !confirmed
  ) {

    return;

  }


  const buffer =
    await file.arrayBuffer();


  const crc =
    crc32(
      buffer
    );


  otaRunning =
    true;


  $("otaStart").disabled =
    true;


  $("otaAbort").disabled =
    false;


  $("otaState").textContent =
    "Đang khởi tạo OTA...";


  $("otaBar").style.width =
    "0%";


  $("otaPercent").textContent =
    "0%";


  $("otaSpeed").textContent =
    "0 KB/s";


  $("otaBytes").textContent =
    "0 KB";


  $("otaTime").textContent =
    "0.0 s";


  // ========================================================
  // START OTA
  // ========================================================

  await otaCtrlChr.writeValue(

    enc.encode(

      `START {"size":${file.size},"crc32":${crc}}`

    )

  );


  // Cho ESP32-C3 thời gian chuẩn bị OTA partition.
  await new Promise(
    resolve =>
      setTimeout(
        resolve,
        500
      )
  );


  const bytes =
    new Uint8Array(
      buffer
    );


  // Bắt đầu 180 byte.
  // Nếu MTU không chịu sẽ tự giảm.
  let chunk =
    180;


  let sent =
    0;


  const started =
    performance.now();


  let lastUi =
    started;


  // ========================================================
  // SEND FIRMWARE
  // ========================================================

  while (
    sent <
    bytes.length
  ) {

    if (
      !otaRunning
    ) {

      throw new Error(
        "Đã hủy OTA"
      );

    }


    if (
      !device?.gatt?.connected
    ) {

      throw new Error(
        "Đã mất kết nối BLE"
      );

    }


    const length =
      Math.min(
        chunk,
        bytes.length -
        sent
      );


    const part =
      bytes.slice(
        sent,
        sent + length
      );


    try {

      // ================================================
      // QUAN TRỌNG:
      // Dùng Write With Response.
      //
      // Không dùng writeValueWithoutResponse()
      // vì Chrome có thể queue nhanh hơn ESP32 nhận.
      // ================================================

      if (
        typeof otaDataChr
          .writeValueWithResponse ===
        "function"
      ) {

        await otaDataChr
          .writeValueWithResponse(
            part
          );

      }

      else {

        // API Web Bluetooth cũ.
        // writeValue() là ATT Write Request.
        await otaDataChr
          .writeValue(
            part
          );

      }

    }

    catch (error) {

      // Nếu chunk lớn hơn MTU cho phép
      // thì tự giảm kích thước.

      if (
        chunk > 20
      ) {

        if (
          chunk > 128
        ) {

          chunk =
            128;

        }

        else if (
          chunk > 64
        ) {

          chunk =
            64;

        }

        else {

          chunk =
            20;

        }


        log(
          `BLE không nhận chunk lớn, giảm xuống ${chunk} byte`
        );


        continue;

      }


      throw error;

    }


    // Chỉ cộng sent khi BLE ACK thành công.
    sent +=
      length;


    const now =
      performance.now();


    if (
      now - lastUi >
        120 ||
      sent ===
        bytes.length
    ) {

      lastUi =
        now;


      const seconds =
        (
          now -
          started
        ) /
        1000;


      const speed =
        (
          sent /
          1024
        ) /
        Math.max(
          seconds,
          0.001
        );


      const percent =
        100 *
        sent /
        bytes.length;


      $("otaBar").style.width =
        percent +
        "%";


      $("otaPercent").textContent =
        percent
          .toFixed(1)
        + "%";


      $("otaSpeed").textContent =
        speed
          .toFixed(1)
        + " KB/s";


      $("otaBytes").textContent =
        (
          sent /
          1024
        )
          .toFixed(1)
        + " KB";


      $("otaTime").textContent =
        seconds
          .toFixed(1)
        + " s";

    }

  }


  // ========================================================
  // END OTA
  // ========================================================

  await otaCtrlChr.writeValue(

    enc.encode(
      "END"
    )

  );


  const seconds =
    (
      performance.now() -
      started
    ) /
    1000;


  const speed =
    (
      bytes.length /
      1024
    ) /
    seconds;


  log(

    `OTA gửi xong: `
    + `${(bytes.length / 1024).toFixed(1)} KB / `
    + `${seconds.toFixed(1)} s = `
    + `${speed.toFixed(1)} KB/s`

  );


  $("otaState").textContent =
    "Đã gửi xong, ESP32-C3 đang kiểm tra CRC32...";

}


// ============================================================
// OTA BUTTON
// ============================================================

$("otaStart").onclick =
  () => {

    otaUpload()
      .catch(
        async error => {

          log(
            "OTA lỗi: "
            + error.message
          );


          $("otaState").textContent =
            "OTA lỗi: "
            + error.message;


          otaRunning =
            false;


          $("otaStart").disabled =
            false;


          $("otaAbort").disabled =
            true;


          try {

            await otaCtrlChr
              .writeValue(
                enc.encode(
                  "ABORT"
                )
              );

          }

          catch {}

        }
      );

  };


$("otaAbort").onclick =
  async () => {

    otaRunning =
      false;


    try {

      await otaCtrlChr
        .writeValue(
          enc.encode(
            "ABORT"
          )
        );

    }

    catch {}


    $("otaState").textContent =
      "Đã hủy OTA.";


    $("otaStart").disabled =
      false;


    $("otaAbort").disabled =
      true;

  };


// ============================================================
// READY
// ============================================================

log(
  "Web BLE OTA ready"
);
