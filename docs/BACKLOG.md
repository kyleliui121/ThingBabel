# v2 待办清单

来自 v1 分支 11 个任务的评审记录与最终全分支评审（2026-10-04）。按优先级排。
2026-10-04 晚：按优化调研报告（`docs/research/2026-10-04-hub-and-device-optimizations.md`）执行了一批，见文末执行记录。

## 健壮性

1. ~~**last_seen 过期看门狗**~~ ✅ 2026-10-04：启动 `setAllOffline()` 交 retain 重放纠正 + `src/watchdog.js` 周期超时判定（`staleOfflineMinutes`，默认 15 分钟，0 关闭）。
2. ~~**body-parse 错误返回 400 + CORS 头**~~ ✅ 2026-10-04：CORS 中间件提前到 json 解析前；畸形 JSON 返 400、超大返 413；未知 `/api/*` 返 JSON 404。
3. ~~**config 告警**~~ ✅ 2026-10-04：默认 `adminPassword`/`jwtSecret` 启动告警（`configWarnings` 纯函数 + 测试）；`config.json` 按 `process.cwd()` 解析仍须在 hub/ 下启动（README 已写，cwd 守护未做，接受）。

## 功能补全

4. **events 的 API/UI**：REST 查询端点 ✅ 2026-10-04（`GET /api/events?device_id=&limit=`，SSE 此前已实时推送）；**手机端事件列表 UI 仍缺**。

## 部署文档

5. **mosquitto 2.x 说明**：默认只监听 localhost，生产部署文档需写明 listener 配置 + 协议 §9 一设备一账号的 passwd 配置步骤。

## App 打磨

6. ~~登录与详情页守卫~~ ✅ 2026-10-04：登录双击防抖、`q.id` 缺失守卫、loadDetail 失败不启实时订阅、manifest name/description 已填。**appid 需在 HBuilderX 里生成（云打包前置），指令按钮防抖未做**。

## 设备固件（ESP32，待采购到货）

7. **客户端库用 espMqttClient，不用 PubSubClient**：PubSubClient 已停止维护且 publish 仅支持 QoS 0，与协议"回执 QoS 1"冲突（优化报告 #3，已核实其官方 README）。
8. **协议 0.2：deadband 差值上报 + 心跳兜底**：加能力位、升 proto_ver；稳态写入量可降一个数量级，电池设备必选（优化报告 #4）。设计稿先行，与实验设计文档 W1 固件任务合并推进。

## 论文线（候选①，见 docs/paper/2026-10-04-candidate1-experiment-design.md）

9. ~~`src/agent.js`：映射规则 + 编排循环 + 确认开关~~ ✅ 2026-10-04：`src/agent/`（map.js 映射 + index.js 编排 + llm.js 适配器 + cli.js 入口）完成，8 项测试覆盖查询/控制/确认拒绝/离线守卫/未知工具/步数上限。**真机 LLM 调用待填 llm.apiKey 后验证**。
10. 采购 ESP32×3 + SHT31×2 + 继电器×1；确定 LLM API 与版本记录。

## 已裁定不修（记录在案）

- package-lock resolved 指向 npmmirror：npm 校验完整性哈希，内容固定，区域网络正常选择。
- dev.js EADDRINUSE 原始堆栈：DX 打磨，fail-fast 行为可接受。
- 兄弟 handler 直调 null 载荷：经 mqtt.js 路径不可达（payload 恒为 string），且 index.js 路由兜底 try/catch 已提供第二道防线。
- CBOR/压缩、MQTT-SN/CoAP、换时序库、换 NanoMQ/FlashMQ：优化报告判定对本规模过度设计，各"不做"项的回头触发条件见报告。

## 2026-10-04 执行记录（优化报告落地）

- ✅ 遥测批量事务写入 + `synchronous=NORMAL`（原待办"遥测表清理"的写入侧；突发吞吐 6–7 倍）
- ✅ 保留清理任务 `src/prune.js`（原待办 5：遥测/事件表无限增长——已解决；聚合表暂不做）
- ✅ SSE 实时推送 `/api/stream` + app 轮询回退（原待办"空闲轮询可换 WebSocket"——以 SSE 方案完成）
- ✅ 第二批（健壮性）：启动置离线 + last_seen 看门狗、畸形 body 400/JSON 404/CORS 顺序、config 默认值告警、events REST 查询、app 防抖与守卫
- 测试 22 → 34 项全过

## 战略方向（设计稿 §10，不变）

AI 意图层（自我介绍即 tool schema，已立项见论文线）、语义自动生成 UI、控制权租约、时序回放、机器人适配器、ESP32 模板库、电视并入（第二块砖）。
