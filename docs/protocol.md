# Lab 接入协议（lab-proto）v0.1

> 本文档是实验室物联网生态的"宪法"：定义一台设备如何接入中枢、上报数据、接受指令。
> 修订规则：任何语义变动必须升 `proto_ver`；中枢承诺向后兼容——收到旧版本报文按旧规则处理。

## 0. 设计原则

1. **传输层不自造**：设备与中枢之间走 MQTT（中枢运行 mosquitto broker）。
2. **规矩层借鉴**：主题树参考 Homie；能力三元组（properties / actions / events）参考 W3C WoT Thing Description；上线自我介绍 + 遗嘱下线参考 MQTT LWT 与 Sparkplug 出生证书。
3. **接入门槛**：任何会 Arduino / Python 的同学，照本文档一小时内让自己的设备在手机 App 上亮起来。
4. **命名对机器友好**：全小写、下划线分隔、英文 key——自我介绍 JSON 可直接作为 LLM tool schema（为将来 AI 意图层预留，本期不实现）。

## 1. 传输层

| 项 | 规定 |
|----|------|
| Broker | 中枢电脑上的 mosquitto，端口 1883，仅限局域网 |
| 鉴权 | 一设备一账号（mosquitto passwd），账号名 = device_id |
| QoS | 自我介绍、指令、回执用 QoS 1；高频遥测用 QoS 0 |
| retain | 自我介绍、status、props 必须 retain（后来者订阅即得现状） |

## 2. 主题命名

| 主题 | 方向 | retain | 说明 |
|------|------|--------|------|
| `lab/discovery/{device_id}` | 设备→中枢 | ✔ | 自我介绍（能力清单） |
| `lab/devices/{device_id}/status` | 设备→中枢 | ✔ | `online` / `offline`（offline 由遗嘱代发） |
| `lab/devices/{device_id}/props/{key}` | 设备→中枢 | ✔ | 遥测：单属性单主题 |
| `lab/devices/{device_id}/actions/{name}` | 中枢→设备 | ✘ | 指令下行 |
| `lab/devices/{device_id}/actions/{name}/result` | 设备→中枢 | ✘ | 指令回执 |
| `lab/devices/{device_id}/events/{name}` | 设备→中枢 | ✘ | 事件与报警 |

命名规则：`device_id` 用 `类型-序号`（`sensor-01`、`car-01`、`tv-01`）；`key`/`name` 用小写字母 + 下划线。

## 3. 设备自我介绍（discovery）

设备连上 broker 后第一件事：向 `lab/discovery/{device_id}` 发布 retain 消息。

```json
{
  "proto_ver": 1,
  "device_id": "sensor-01",
  "name": "实验室温湿度",
  "type": "sensor",
  "description": "门口货架上的温湿度探头",
  "properties": [
    { "key": "temperature", "name": "温度", "unit": "°C", "type": "number" },
    { "key": "humidity",    "name": "湿度", "unit": "%",   "type": "number" }
  ],
  "actions": [
    { "name": "reboot", "description": "重启设备", "params": [] }
  ],
  "events": []
}
```

字段说明：

| 字段 | 必填 | 说明 |
|------|------|------|
| `proto_ver` | ✔ | 协议版本，本版为 1 |
| `device_id` | ✔ | 全局唯一，与主题、MQTT 账号一致 |
| `name` | ✔ | 人类可读名（中文可用） |
| `type` | ✔ | 设备类型：`sensor` / `vehicle` / `arm` / `screen` / 其他自定义 |
| `description` | ✘ | 一句话说明 |
| `properties` | ✔（可为空数组） | 每项：`key`、`name`、`unit`、`type`（number/string/boolean/enum），可选 `min`/`max`/`enum` |
| `actions` | ✔（可为空数组） | 每项：`name`、`description`、`params[]`（每参数：`name`、`type`、`required`，可选 `enum`/`min`/`max`） |
| `events` | ✔（可为空数组） | 每项：`name`、`description` |

处理规则：

- 中枢收到即登记或更新该设备（以 `device_id` 为主键，重复发布覆盖旧介绍）。
- 设备每次上电都必须重新发布自我介绍。
- 能力变更 = 重新发布（retain 自动覆盖）。

## 4. Properties（遥测）

- 主题：`lab/devices/{device_id}/props/{key}`，retain。
- 载荷：**JSON 标量**（数字、字符串、布尔直接发布，如 `23.5`、`"ok"`、`true`）。
- 时间戳：中枢以收到时刻入库，设备不需要管时钟。
- 频率建议：≥ 1 次/分钟的量用 QoS 0；低于此频率或重要状态可升 QoS 1。

## 5. Actions（指令与回执）

指令（中枢→设备），发布到 `lab/devices/{device_id}/actions/{name}`：

```json
{ "action_id": "a1b2c3", "params": { "x": 1.5 } }
```

回执（设备→中枢），发布到 `lab/devices/{device_id}/actions/{name}/result`：

```json
{ "action_id": "a1b2c3", "status": "ok", "message": "" }
```

- `action_id` 由中枢生成（短随机串），回执靠它关联；必填。
- `status` 取值：`ok` / `error` / `rejected`（设备拒绝，如不安全）。
- 中枢发出指令后 5 秒未收到回执，标记为 `timeout`。
- 设备不认识的主题/指令：忽略并回 `rejected`。

## 6. Events（事件与报警）

- 主题：`lab/devices/{device_id}/events/{name}`，不 retain。
- 载荷：自由 JSON，建议含 `severity`（`info` / `warn` / `error`）与 `message`。
- v1 中枢只做记录与转发给手机端列表，不做处理逻辑。

## 7. 上下线

1. 设备连接 broker 时注册**遗嘱**：去世时由 broker 代发 `lab/devices/{device_id}/status` = `offline`（retain）。
2. 连接成功后依次发布：自我介绍（discovery）→ `status` = `online`（retain）。
3. 正常退出前可主动发 `offline`。
4. 中枢以 status 消息 + `last_seen`（任意消息刷新）维护在线状态。

## 8. 铁律（MUST）

1. `discovery` 与指令报文必含 `proto_ver`。
2. `discovery`、`status`、`props` 必须 retain。
3. 指令必带回执，回执必带原 `action_id`。
4. `device_id` 全局唯一，一经分配不复用（设备报废就换新号）。
5. 所有 key/name 小写下划线；`device_id` 与 MQTT 账号名一致。

## 9. 安全

- MQTT：账号密码，一设备一账号（mosquitto `passwd` 文件，由中枢管理员维护）。
- HTTP（手机端 ↔ 中枢）：账号密码登录换 JWT token，有效期 7 天。
- 整个系统只存在于实验室局域网，禁止端口映射到公网。

## 10. 版本演进

- `proto_ver` 从 1 起整数递增；新增可选字段不升版本（向后兼容）。
- 破坏性变更（改字段语义、改主题结构）必须升大版本，中枢保留旧版解析分支。
