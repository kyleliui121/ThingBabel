# v2 待办清单

来自 v1 分支 11 个任务的评审记录与最终全分支评审（2026-10-04）。按优先级排。
2026-10-04 晚：按优化调研报告执行了一批（报告在私有目录），见文末执行记录。

## 健壮性

1. ~~**last_seen 过期看门狗**~~ ✅ 2026-10-04：启动 `setAllOffline()` 交 retain 重放纠正 + `src/watchdog.js` 周期超时判定（`staleOfflineMinutes`，默认 15 分钟，0 关闭）。
2. ~~**body-parse 错误返回 400 + CORS 头**~~ ✅ 2026-10-04：CORS 中间件提前到 json 解析前；畸形 JSON 返 400、超大返 413；未知 `/api/*` 返 JSON 404。
3. ~~**config 告警**~~ ✅ 2026-10-04：默认 `adminPassword`/`jwtSecret` 启动告警（`configWarnings` 纯函数 + 测试）；`config.json` 按 `process.cwd()` 解析仍须在 hub/ 下启动（README 已写，cwd 守护未做，接受）。

## 功能补全

4. **events 的 API/UI**：REST 查询端点 ✅ 2026-10-04（`GET /api/events?device_id=&limit=`，SSE 此前已实时推送）；**手机端事件列表 UI 仍缺**。

## 部署文档

5. ~~**mosquitto 2.x 说明**~~ ✅ 2026-10-04：`docs/deploy.md`（安装/双 listener/passwd 一设备一账号/pm2/开机自启/验收/备份/FAQ）+ `hub/mosquitto.conf.example`。

## App

~~手机端~~ **已于 2026-10-04 应需求方要求整体移除**（uni-app 工程，git 历史可恢复）；将来重建按"REST + SSE 消费者"路线（root README 四平台接入指南第 1 条），接入协议不变。原"App 打磨"待办随之作废。

## 设备固件（ESP32，待采购到货）

7. **客户端库用 espMqttClient，不用 PubSubClient**：PubSubClient 已停止维护且 publish 仅支持 QoS 0，与协议"回执 QoS 1"冲突（优化报告 #3，已核实其官方 README）。
8. ~~**协议 0.2：deadband 差值上报 + 心跳兜底**~~ 设计稿完成 ✅ 2026-10-04：`docs/protocol-0.2-deadband-draft.md`（可选字段不升 proto_ver，中枢/手机端零改动）；**固件实现待 ESP32 到货**，与实验设计文档 W1 任务合并。

## 论文线

论文相关的规划、调研与评测设计文档已移至仓库外私有目录（`private/`，不入公开仓，防止抢先披露与双盲审稿问题）。工程侧待办仍在本文件维护；论文线工作在私有目录推进。

## 已裁定不修（记录在案）

- package-lock resolved 指向 npmmirror：npm 校验完整性哈希，内容固定，区域网络正常选择。
- dev.js EADDRINUSE 原始堆栈：DX 打磨，fail-fast 行为可接受。
- ~~兄弟 handler 直调 null 载荷~~ 已由重排缓冲与入口兜底覆盖。
- CBOR/压缩、MQTT-SN/CoAP、换时序库、换 NanoMQ/FlashMQ：优化报告判定对本规模过度设计，各"不做"项的回头触发条件见报告。

## 2026-10-04 执行记录（优化报告落地）

- ✅ 遥测批量事务写入 + `synchronous=NORMAL`（原待办"遥测表清理"的写入侧；突发吞吐 6–7 倍）
- ✅ 保留清理任务 `src/prune.js`（原待办 5：遥测/事件表无限增长——已解决；聚合表暂不做）
- ✅ SSE 实时推送 `/api/stream` + app 轮询回退（原待办"空闲轮询可换 WebSocket"——以 SSE 方案完成）
- ✅ 第二批（健壮性）：启动置离线 + last_seen 看门狗、畸形 body 400/JSON 404/CORS 顺序、config 默认值告警、events REST 查询、app 防抖与守卫
- ✅ 第三批（复用层）：dev broker WS 监听 9001（端到端验证）、web-screen 电视/浏览器页、esp32 固件模板、四平台复用 README、按运行位置分类的交付包
- ✅ 第四批（收尾加固）：**重排缓冲 `src/reorder.js`**（修复真实 bug：QoS0 遥测抢在 QoS1 discovery 前到达被误吞/retain 重放顺序同样触发）、WS 路径锁进自动化测试、mock 温度钳位、长稳脚本 `npm run soak`（中途杀设备验证 LWT+看门狗）、协议 0.2 deadband 设计稿、生产部署指南 `docs/deploy.md`
- 测试 22 → 45 项全过

## 战略方向（设计稿 §10，不变）

AI 意图层（自我介绍即 tool schema，已立项见论文线）、语义自动生成 UI、控制权租约、时序回放、机器人适配器、ESP32 模板库、电视并入（第二块砖）。
