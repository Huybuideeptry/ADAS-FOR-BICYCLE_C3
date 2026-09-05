# ADAS Bike Monitor Web v2

Cập nhật cho firmware ESP32-C3 + HLK-LD2451 UART.

## Thêm mới
- Hiển thị targets, SNR, TTC
- Chỉnh:
  - range_m
  - direction
  - min_speed_kmh
  - delay_s
  - trigger_count
  - snr_threshold
  - ttc_warn
  - ttc_critical
- RADAR_READ
- RADAR_FW
- PING
- Radar config notify nếu firmware hỗ trợ
- GeoJSON log thêm radar fields

## Deploy
Thay 3 file trong repo GitHub Pages:
- index.html
- style.css
- app.js

GitHub Pages sẽ tự cập nhật sau commit.
