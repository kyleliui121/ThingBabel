# 实验室物联网生态 — 总体设计（v1：通用层）

日期：2026-10-04
状态：设计中与需求方确认后的实施稿
关联文档：`docs/protocol.md`（接入协议 v0.1，本系统的宪法）；`2026-10-04-lab-signage-design.md`（电视展示系统，将作为第二块砖并入本生态）

## 1. 背景与目标

实验室有电视（安卓 7 网页壳）、机械臂、自制智能小车（ESP32 / 树莓派），全部位于同一局域网。目标是建立一套自研的"实验室万物互联"生态：

- 统一接入协议，任何按协议行事的设备即插即认
- 一个中枢（实验室常开电脑）负责登记、存储、分发
- 一个手机 App 作为整个生态的遥控器与仪表盘

**性质**：学习练手项目（第一个完整全栈项目）。优先级：做完 > 学到 > 做好 > 做新。

**差异化定位**（为什么自己造）：中文实验室场景的低接入门槛（同学一页文档一小时入网）、机器人是一等公民、单人一下午可读完的代码库。明确不做 ThingsBoard/HA 的通用平台功能。

## 2. v1 范围（通用层五件套）

| # | 件 | 内容 |
|---|----|------|
| 1 | 协议 | `docs/protocol.md` v0.1，已定稿 |
| 2 | 中枢 hub | mosquitto + Express + SQLite：设备登记、遥测落库、指令下发、REST API |
| 3 | Mock 设备 | Node 脚本模拟温湿度传感器，协议的第一个实现者与测试工具 |
| 4 | 手机 App | uni-app：登录 / 设备列表 / 设备详情（实时数据） |
| 5 | 里程碑 | mock 设备上电 → 中枢零配置登记 → 手机看到数据跳动 |

**明确押后**（v1 不做）：AI 意图层、语义自动生成 UI、控制权租约、时序回放、机器人适配器（等摸清小车/机械臂现状）、真 ESP32 固件、视频流、规则引擎、公网访问、多用户权限。电视展示系统并入为第二块砖（其 contents 管理迁入 hub，电视成为 `type: screen` 的设备）。

## 3. 总体架构

```
┌──────────┐  ┌─────────────┐  ┌────────────┐  ┌───────────┐
│ 手机 App  │  │ mock 传感器  │  │ 电视(第二砖) │  │ 小车/臂(后续)│
└────┬─────┘  └──────┬──────┘  └─────┬──────┘  └─────┬─────┘
     │ HTTP/REST            │ MQTT          │ MQTT         │ MQTT
     └──────────────┬───────┴───────────────┴──────────────┘
                    │
        ┌───────────┴────────────┐
        │ 中枢（实验室常开电脑）     │
        │ mosquitto broker:1883  │
        │ Express API :3000      │
        │ SQLite data.db         │
        └────────────────────────┘
```

- 星型拓扑：所有"物"只与中枢对话。
- 设备 ↔ 中枢走 MQTT（推送、低开销）；手机 ↔ 中枢走 HTTP（请求-响应天然契合管理与查询）。
- v1 手机端实时性用轮询实现（详情页 3 秒一刷），WebSocket 押后。

## 4. 中枢 hub 设计

### 4.1 技术栈

Node.js 20+ / Express 4 / better-sqlite3 / mqtt.js（中枢自身作为 MQTT 客户端连接本机 broker）/ jsonwebtoken / pm2 守护。

### 4.2 模块划分

```
hub/
  src/
    index.js      入口：启动 express + mqtt 监听
    config.js     读取 config.json（端口、密码、mqtt 地址）
    db.js         SQLite 初始化与全部 SQL
    mqtt.js       连接 broker，订阅 lab/#，按主题路由
    handlers/     discovery / status / props / action_result 处理器
    api.js        Express 路由（REST API）
  package.json
  config.example.json
```

### 4.3 数据表

```sql
-- 设备登记表（discovery 落库）
devices(id PK, device_id UNIQUE, name, type, description,
        proto_ver, caps_json,   -- 自我介绍原文
        online INTEGER, last_seen TEXT, created_at, updated_at)

-- 遥测（props 落库；ts 为中枢收到时刻）
telemetry(id PK, device_id, key, value TEXT, ts TEXT)
  INDEX(device_id, key, ts)

-- 指令日志（含回执状态机 pending→ok/error/rejected/timeout）
actions_log(action_id PK, device_id, action_name, params_json,
            status, message, created_at, updated_at)

-- 事件（events 落库，v1 仅展示）
events(id PK, device_id, name, payload_json, ts)
```

### 4.4 REST API（手机端用，均需 Bearer token，除 login）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/login` | `{password}` → `{token}`（7 天） |
| GET | `/api/devices` | 设备列表：device_id、name、type、online、last_seen、各 props 最新值 |
| GET | `/api/devices/:id` | 设备详情：caps（自我介绍解析后） |
| GET | `/api/devices/:id/props` | 最新遥测：`[{key, value, ts}]` |
| GET | `/api/devices/:id/props/history?key=&limit=` | 单属性历史（默认 100 条，v1 详情页画曲线用可后补） |
| POST | `/api/devices/:id/actions` | `{name, params}` → 生成 action_id，发 MQTT，返回 `{action_id}` |
| GET | `/api/actions/:action_id` | 查询回执状态 |

统一响应 `{code: 0, data}` / `{code: 非0, message}`；400/401/404/500 语义同电视设计稿。

### 4.5 中枢内部流程

- **MQTT 路由**：`lab/discovery/+` → 解析校验 → upsert devices → 更新 last_seen；`lab/devices/+/status` → 更新 online；`lab/devices/+/props/+` → 写 telemetry；`lab/devices/+/actions/+/result` → 更新 actions_log；`lab/devices/+/events/+` → 写 events。
- **指令下发**：POST actions → 生成 action_id → 发布 `lab/devices/{id}/actions/{name}` → 5 秒定时器检查回执，未回执置 timeout。
- **启动即重放**：中枢订阅后靠 retain 消息立即获得全部设备介绍与最后遥测（断电重启不失忆）。
- **校验容错**：discovery 非法 JSON / 缺必填字段 → 记日志丢弃，不影响其他消息。

## 5. Mock 设备设计

`devices/mock/mock-sensor.js`：Node + mqtt.js。

- 启动即按协议发布自我介绍（device_id `sensor-01`，properties 温度/湿度，action reboot）+ 遗嘱 + online。
- 每 5 秒发布一次温湿度（随机游走：23°C ±、45% ±），QoS 0 + retain。
- 收到 reboot 指令：回执 ok，2 秒后重发自我介绍（模拟重启上线）。
- 配置走环境变量：`MQTT_URL`、`DEVICE_ID`，默认本机。

## 6. 手机 App 设计（uni-app）

页面三张：

1. **登录页**：后端地址（`http://192.168.x.x:3000`，可修改，存 storage）+ 密码。
2. **设备列表页**：每设备显示 name、type 图标、online 圆点、关键遥测摘要；下拉刷新。
3. **设备详情页**：按 caps 动态渲染——properties 列表（名称、单位、最新值、更新时间），actions 按钮（点击 → POST → 3 秒内轮询回执 → toast 结果）。

网络层：统一 request 封装（base_url + token 自动携带；401 清 token 跳登录）。v1 真机联调用 HBuilderX 标准基座。

## 7. 错误处理

| 场景 | 行为 |
|------|------|
| 设备发非法报文 | 中枢记日志丢弃，不崩 |
| 中枢重启 | retain 重放恢复设备表与最后遥测；actions_log 中 pending 置 timeout |
| 设备掉线 | 遗嘱 → status offline → App 列表灰显 |
| 指令无回执 | 5 秒超时 → App 显示 timeout |
| App 连不上中枢 | 明确提示"无法连接 <地址>"，不崩溃 |
| broker/中枢崩溃 | pm2 拉起；SQLite 落盘无数据丢失 |

## 8. 测试与验收

- **单元/集成**（hub）：mqtt 消息路由（用 mqtt.js 客户端在测试中扮演设备）、discovery 校验、actions 超时状态机、REST API（supertest）。
- **端到端验收（里程碑一）**：
  1. 全新环境启动 broker + hub + mock 设备
  2. hub 日志显示 sensor-01 自动登记，无任何手工配置
  3. 手机 App 登录 → 列表出现 sensor-01（绿点）→ 详情页温湿度数字每几秒跳动
  4. 点 reboot → 收到 ok 回执 → 设备重新自我介绍
  5. 杀掉 mock 进程 → App 列表 30 秒内变灰（遗嘱生效）
  6. 重启中枢 → 设备与数据仍在（retain 重放）

## 9. 部署

- mosquitto：安装后配置 `allow_anonymous false` + passwd 文件（初版可先 anonymous 跑通，第二迭代加账号）。
- hub：`npm i` → `node src/index.js`，生产 `pm2 start` + `pm2 save` + Windows 计划任务开机 resurrect。
- 中枢电脑路由器 DHCP 静态绑定。

## 10. 仓库结构（monorepo）

```
D:\apps\
  docs/            protocol.md + specs/
  hub/             中枢
  devices/mock/    mock 传感器（后续 ESP32 固件放 devices/esp32/）
  app/             uni-app 手机端
```

## 11. 第二块砖衔接说明（电视）

电视并入时：hub 增加 contents 表与展示 API（沿用电视设计稿 4.2/4.3 节），电视端从"轮询独立后端"改为"轮询 hub 的 display 接口"，`device_id = tv-01`，注册为 `type: screen` 设备。电视设计稿其余部分（离线缓存、轮询节奏）不变。
