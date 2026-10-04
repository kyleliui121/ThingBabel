# Lab Ecosystem（实验室万物互联生态）

局域网物联网生态：设备说 **lab-proto** 协议（MQTT 之上的一层薄规范），中枢统一登记存储，
手机/浏览器/电视查看与控制，AI 编排层用自然语言指挥一切。

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
        手机 app(H5/APK)   AI 编排 agent        更多消费者
        (REST + SSE)      (LLM，自然语言任务)
```

## 目录

| 目录 | 是什么 | 复用方式 |
|------|--------|---------|
| `docs/protocol.md` | **协议宪法**——接入规范，一切复用的起点 | 任何平台照此实现即接入 |
| `hub/` | 中枢：MQTT 摄入、SQLite 存储、REST API、SSE、看门狗、清理 | 原样部署（实验室电脑） |
| `devices/web-screen/` | 浏览器/电视展示页（单 HTML + MQTT.js over WS） | **web/电视端**参考：全协议公民 |
| `devices/esp32/` | ESP32 固件模板（espMqttClient） | **开发板端**参考（未硬件验证） |
| `devices/mock/` | Node.js 模拟传感器 | 任何电脑/树莓派上的**脚本设备**模板 |
| `hub/src/agent/` | AI 编排：能力清单零转换成 LLM tool schema + 指令回执闭环 | 自然语言任务入口 |
| `docs/` | 设计文档、两份调研报告、论文实验设计、BACKLOG | 背景与规划 |

## 四类平台怎么接入（复用路径）

1. **手机 app**：做 REST + SSE 消费者（登录换 token → `/api/devices` → `/api/stream` 实时推送 → `/api/devices/:id/actions` 下指令），不需要碰 MQTT。内置手机端已于 2026-10-04 移除（git 历史可参考 `app/` 的历史版本），接入协议不变，按此路线重建即可。
2. **web 页 / 电视**：打开 `devices/web-screen/index.html`（默认连本机 `ws://<host>:9001`，可用 `?broker=ws://192.168.x.x:9001` 指定中枢）。它自己也是一个协议设备：自我介绍、遗嘱、指令回执齐全，电视壳里替换原有页面即可。
3. **开发板**：抄 `devices/esp32/lab_sensor/lab_sensor.ino`——五个协议要素（discovery/LWT/遥测/回执/retain）都有现成代码，改成你的传感器读数即可。
4. **任何能跑脚本的东西**：抄 `devices/mock/mock-sensor.js`（Node）或按 `docs/protocol.md` 用任意 MQTT 库实现（Python paho、Go 等同理）。

## 快速开始

```bash
# 首次：hub / devices/mock 各自 npm install
cd hub && npm run dev            # 终端1：中枢 + 内存 broker（1883 TCP / 9001 WS / 3000 API）
cd devices/mock && npm start      # 终端2：模拟传感器，上线即自动登记
# 电视/大屏：直接打开 devices/web-screen/index.html
# AI 编排：hub/config.json 填 llm.apiKey 后 → node hub/src/agent/cli.js "现在传感器多少度？"
```

登录：`admin` / `lab123`（hub/config.json 的 adminPassword，生产必改）。

## 状态（2026-10-04）

- hub 测试通过数与版本事实以 [CHANGELOG.md](CHANGELOG.md) 为唯一来源（当前 v0.1.2）
- WS 接入路径已端到端验证（浏览器方式连 9001 → 自动登记 → 遗嘱生效）
- ⚠️ ESP32 固件是**未硬件验证的模板**；LLM 真机调用待填 API key
- 局域网专用，勿暴露公网（协议 §9）

## 下一步

见 `docs/BACKLOG.md` 与 `docs/paper/2026-10-04-candidate1-experiment-design.md`（论文线）。
