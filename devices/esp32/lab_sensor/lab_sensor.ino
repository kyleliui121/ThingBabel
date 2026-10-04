// lab-proto v0.1 参考固件：ESP32 温湿度传感器（随机游走版）
// ⚠️ 草稿：未在硬件上验证，espMqttClient API 以所装库版本为准（Arduino IDE 库管理器安装 "espMqttClient" by Bert Melis）
// 接真实传感器：把 publishTelemetry() 里的随机游走换成 SHT31/DHT22 读数即可（TODO 标记处）
#include <WiFi.h>
#include <espMqttClient.h>

// ---- 按需修改这三行 ----
const char* WIFI_SSID = "lab-wifi";
const char* WIFI_PASS = "wifi-password";
const char* MQTT_HOST = "192.168.1.100"; // 中枢电脑的内网 IP；端口 1883（TCP，不是 9001 的 WS）
// ----------------------

const char* DEVICE_ID = "sensor-esp-01";

WiFiClient netClient;
MqttClient mqtt(netClient);

float temp = 23.0, hum = 45.0;
unsigned long lastPub = 0;

// 协议 §3：自我介绍（能力清单，中枢据此登记并生成 LLM tool schema）
const char* INTRO = "{"
  "\"proto_ver\":1,"
  "\"device_id\":\"" DEVICE_ID "\","
  "\"name\":\"ESP32 温湿度\","
  "\"type\":\"sensor\","
  "\"description\":\"espMqttClient 参考固件\","
  "\"properties\":["
  "{\"key\":\"temperature\",\"name\":\"温度\",\"unit\":\"°C\",\"type\":\"number\"},"
  "{\"key\":\"humidity\",\"name\":\"湿度\",\"unit\":\"%\",\"type\":\"number\"}"
  "],"
  "\"actions\":[{\"name\":\"reboot\",\"description\":\"重启设备\",\"params\":[]}],"
  "\"events\":[]}";

void onMqttConnect(bool sessionPresent) {
  Serial.println("[mqtt] connected");
  // 协议 §7：上线三件事——自我介绍(retain) + online(retain) + 订阅自己的指令
  mqtt.publish(String("lab/discovery/") + DEVICE_ID, 1, true, INTRO);
  mqtt.publish(String("lab/devices/") + DEVICE_ID + "/status", 1, true, "online");
  mqtt.subscribe(String("lab/devices/") + DEVICE_ID + "/actions/+", 1);
}

// 协议 §5：收到指令回执，action_id 原样带回
void onMqttMessage(char* topic, char* payload, MqttProperties& properties, size_t len, size_t index, size_t total) {
  String t = String(topic);
  if (!t.startsWith(String("lab/devices/") + DEVICE_ID + "/actions/")) return;
  String p = String(payload).substring(0, len);
  int idPos = p.indexOf("\"action_id\":\"");
  String actionId = idPos < 0 ? "" : p.substring(idPos + 13, p.indexOf('"', idPos + 13));

  String action = t.substring(t.lastIndexOf('/') + 1);
  if (action == "reboot") {
    mqtt.publish(t + "/result", 1, false, String("{\"action_id\":\"") + actionId + "\",\"status\":\"ok\",\"message\":\"\"}");
    delay(500);
    ESP.restart();
  } else {
    mqtt.publish(t + "/result", 1, false,
      String("{\"action_id\":\"") + actionId + "\",\"status\":\"rejected\",\"message\":\"unknown action\"}");
  }
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.printf("\n[wifi] %s\n", WiFi.localIP().toString().c_str());

  mqtt.setServer(MQTT_HOST, 1883);
  // 协议 §7：遗嘱——异常掉电时由 broker 代发 offline（retain）
  mqtt.setWill(String("lab/devices/") + DEVICE_ID + "/status", 1, true, "offline");
  mqtt.onConnect(onMqttConnect);
  mqtt.onMessage(onMqttMessage);
  mqtt.connect();
}

void loop() {
  // TODO: 换成真实传感器读数，例如 Adafruit SHT31 库：temp = sht31.readTemperature();
  temp += (random(-20, 20) / 100.0);
  hum = constrain(hum + (random(-50, 50) / 100.0), 0, 100);

  if (millis() - lastPub > 5000) {
    lastPub = millis();
    // 协议 §4：单属性单主题，retain；高频遥测 QoS 0
    mqtt.publish(String("lab/devices/") + DEVICE_ID + "/props/temperature", 0, true, String(temp, 1));
    mqtt.publish(String("lab/devices/") + DEVICE_ID + "/props/humidity", 0, true, String((int)hum));
  }
  delay(100);
}
