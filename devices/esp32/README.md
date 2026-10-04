# ESP32 参考固件（lab-proto v0.1）

`lab_sensor/lab_sensor.ino`：温湿度传感器固件模板，完整实现协议的五个要素——
自我介绍（discovery/retain）、上下线（LWT 遗嘱）、遥测（单属性单主题/retain/QoS0）、
指令回执（action_id 原样带回）、未知指令 rejected。

## 使用

1. Arduino IDE 安装库：**espMqttClient**（作者 Bert Melis）。⚠️ 不要用 PubSubClient——已停止维护且 publish 只支持 QoS 0，与协议"回执 QoS 1"冲突。
2. 改 sketch 顶部三行：WiFi 名、WiFi 密码、中枢电脑内网 IP（端口 1883）。
3. 上电即自动登记到中枢，手机 H5 和 `node src/agent/cli.js` 里立刻可见。

## 状态

**草稿，未在硬件上验证**（等 ESP32 到货后按 README 清单验收）。espMqttClient 的个别
API 签名（`setWill`/`onMessage` 参数）以所装库版本示例为准，若有出入对照库自带示例微调。

接真实 SHT31 传感器：替换 `loop()` 里 TODO 标记的随机游走为 `sht31.readTemperature()`（Adafruit SHT31 库）。
