# lab-hub 中枢

开发：`npm install && cp config.example.json config.json && npm run dev`
（开发模式自带内存 broker，无需 mosquitto；config.json 不入库）

生产（实验室电脑）：安装 mosquitto 并监听 1883 → `npm start`，pm2 守护：
`pm2 start src/index.js --name lab-hub && pm2 save`

测试：`npm test`（内置 aedes，无外部依赖）

## 快速开始（全链路）

两个终端依次启动（首次先在 hub / devices/mock 各自 `npm install`）：

```bash
# 终端 1 —— 中枢（含内存 broker，占用 1883 + 9001 + 3000）
cd hub && npm run dev

# 终端 2 —— 模拟温湿度传感器（无需任何手工配置，上线即自动登记）
cd devices/mock && npm start
```

浏览器验收（打开 `../devices/web-screen/index.html`，人工逐项打勾）：

- [ ] 终端 1 控制台出现 sensor-01 登记日志——设备上线即自动登记，无任何手工配置
- [ ] web-screen 页面出现 sensor-01，绿色在线点，温度/湿度即时跳动（Network 里有一条持续的 WS 连接）
- [ ] 杀掉 mock（终端 2 Ctrl+C）→ web-screen 上 sensor-01 变灰"离线"（MQTT 遗嘱 LWT）
- [ ] 重启 hub（保留 data.db）→ 设备与最后遥测仍在（retain 消息重放）

以上登记日志、遗嘱下线、重启 retain 重放已用 curl 全链路验证；页面视觉效果留待人工勾选。

## AI 编排（论文候选①核心，src/agent/）

设备自我介绍的能力清单直接映射为 LLM tool schema（零转换），自然语言任务经"规划→指令→回执→汇报"闭环执行：

```bash
# config.json 的 llm.apiKey 填入 BigModel API Key 后：
node src/agent/cli.js "现在传感器多少度？"
node src/agent/cli.js "重启一下传感器"
```

安全策略：sensor 类设备动作直接放行，其余类型 CLI 交互确认（y/N）。

**评测 trace（OTel GenAI 兼容）**：每次任务自动产出结构化 trace（root `agent.task` → `gen_ai.chat` → `tool` 父子链，含 `gen_ai.system/model`、回执状态、action_id），落 SQLite `traces` 表：

```bash
curl -H "Authorization: Bearer <token>" http://<hub>:3000/api/traces       # 摘要（含任务文本）
curl -H "Authorization: Bearer <token>" http://<hub>:3000/api/traces/<id>  # 全部 span
```

**评测基建**（实验设计 v0.2，论文线）：`npm run eval` 跑 30 任务集（M2 成功率/M4 延迟自动判分，精确缓存省 k 次重复成本）；`npm run fleet`（FLEET_SIZE=100）拉虚拟设备群做 M5 工具数曲线；中枢内置 EWMA 异常检测（`anomalyZ` 配置）产生 anomaly 事件。口径见 `../docs/paper/metrics-definitions.md`。

设计与评估方案见 `docs/paper/2026-10-04-candidate1-experiment-design.md`。
