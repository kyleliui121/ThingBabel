[English](README_EN.md) | 中文

# ThingBabel（实验室万物互联生态）

局域网物联网生态：设备说 **lab-proto** 协议（MQTT 之上的一层薄规范），中枢统一登记存储，
Web/电视大屏查看，CLI/Agent 用自然语言指挥一切。

> **ThingBabel** = 让设备各说方言、却被普适听懂——设备上电自我介绍（能力清单），
> 中枢把这份清单**零人工转换**地变成 LLM 可直接调用的工具集。

```
┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────┐
│ ESP32 板  │  │ 浏览器/电视   │  │ Node 脚本   │  │ 任意语言   │   …"物"
│ (TCP1883) │  │ (WS 9001)    │  │ (TCP 1883) │  │ 说 MQTT   │
└─────┬────┘  └──────┬───────┘  └─────┬──────┘  └────┬─────┘
      └──────────────┴───────┬────────┴──────────────┘
                       lab-proto v0.1 协议
                      ┌───────┴────────┐
                      │ hub 中枢        │  登记/存储/看门狗/清理
                      │ (Node+Express+  │  REST + SSE 推送
                      │  SQLite)        │
                      └───────┬────────┘
              ┌───────────────┼────────────────┐
        Web/电视大屏        AI 编排 agent       REST 消费者
        (web-screen,WS)    (CLI，自然语言任务)  (登录 token + SSE)
```

## 目录

| 目录 | 是什么 | 复用方式 |
|------|--------|---------|
| `docs/protocol.md` | **协议宪法**——接入规范，一切复用的起点 | 任何平台照此实现即接入 |
| `hub/` | 中枢：MQTT 摄入、SQLite 存储、REST API、SSE、看门狗、清理、异常检测 | 原样部署（实验室电脑） |
| `devices/web-screen/` | 浏览器/电视展示页（单 HTML + MQTT.js over WS） | **web/电视端**参考：全协议公民 |
| `devices/esp32/` | ESP32 固件模板（espMqttClient） | **开发板端**参考（未硬件验证） |
| `devices/mock/` | Node.js 模拟传感器 | 任何电脑/树莓派上的**脚本设备**模板 |
| `hub/src/agent/` | AI 编排：能力清单零转换成 LLM tool schema + 指令回执闭环 | 自然语言任务入口 |
| `hub/eval/` | 论文评测基建：30 任务集、runner、M5 批量、精确缓存 | 复现实验 |
| `docs/` | 设计文档、调研报告、论文实验设计、BACKLOG | 背景与规划 |

## 三类消费者怎么接入（复用路径）

1. **Web 页 / 电视**：打开 `devices/web-screen/index.html`（默认连本机 `ws://<host>:9001`，可用 `?broker=ws://192.168.x.x:9001` 指定中枢）。它自己也是一个协议设备：自我介绍、遗嘱、指令回执齐全，电视壳里替换原有页面即可。
2. **CLI / Agent**：`node hub/src/agent/cli.js "自然语言任务"`——能力清单零转换成 tool schema，规划→指令→回执→汇报，OTel GenAI 兼容 trace 全程落库。
3. **MQTT 设备**：开发板抄 `devices/esp32/lab_sensor/lab_sensor.ino`（discovery/LWT/遥测/回执/retain 五要素齐全）；脚本设备抄 `devices/mock/mock-sensor.js`（任意语言按 `docs/protocol.md` 同理）。

> 手机端 App 已于 v0.1.1 移除（当时为 uni-app 工程，git 历史可查）；如需重建，走"REST + SSE 消费者"路线（登录换 token → `/api/devices` → `/api/stream` → `/api/devices/:id/actions`），协议不变——详见 CHANGELOG 迁移说明。

## 快速开始

```bash
# 首次：hub / devices/mock 各自 npm install
cd hub && npm run dev            # 终端1：中枢 + 内存 broker（1883 TCP / 9001 WS / 3000 API）
cd devices/mock && npm start      # 终端2：模拟传感器，上线即自动登记
# 电视/大屏：直接打开 devices/web-screen/index.html
# AI 编排：hub/config.json 填 llm.apiKey 后 → node hub/src/agent/cli.js "现在传感器多少度？"
```

登录：`admin` / `lab123`（hub/config.json 的 adminPassword，生产必改）。

## 状态

- hub 测试通过数与版本事实以 [CHANGELOG.md](CHANGELOG.md) 为唯一来源（当前 v0.1.8）
- WS 接入路径已端到端验证（浏览器方式连 9001 → 自动登记 → 遗嘱生效）
- ⚠️ ESP32 固件是**未硬件验证的模板**；LLM 真机调用待填 API key
- 局域网专用，勿暴露公网（协议 §9）

## 下一步

见 `docs/BACKLOG.md`。

## 许可证

[MIT](LICENSE)
