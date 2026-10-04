# v2 待办清单

来自 v1 分支 11 个任务的评审记录与最终全分支评审（2026-10-04）。按优先级排：

## 健壮性

1. **last_seen 过期看门狗**：hub 重启后设备在线状态依赖 retain 重放顺序（当前按主题排序恰好正确）；启动时先把所有设备置离线、靠 retain 重放纠正，再加 last_seen 超时判定——彻底消除顺序依赖。
2. **body-parse 错误返回 400 + CORS 头**：畸形 JSON body 目前 500 且无 CORS 头（H5 端显示为不透明网络错误）；未知 `/api/*` 路由返回 JSON envelope 而非 Express HTML 404。
3. **config 告警**：`jwtSecret`/`adminPassword` 用默认值时启动打警告；`config.json` 按 `process.cwd()` 解析，须在 hub/ 目录下启动（README 已写，可加守护）。

## 功能补全

4. **events 的 API/UI**：协议 §6 承诺"转发给手机端列表"，spec §4.4 未列端点——v2 规划时先在 spec 层解决这个不一致再实现。
5. **遥测/事件表清理**：目前无限增长，需要 prune 策略（按条数或按天数）。

## 部署文档

6. **mosquitto 2.x 说明**：默认只监听 localhost，生产部署文档需写明 listener 配置 + 协议 §9 一设备一账号的 passwd 配置步骤。

## App 打磨

7. 登录与指令按钮双击防抖（`if (loading) return`）；详情页 loadDetail 失败时不启 3 秒轮询；`q.id` 缺失守卫；manifest 的 name/appid 填写。
8. 空闲轮询可换 WebSocket（设计稿押后项）。

## 参考实现（devices/mock）

9. 温度随机游走加钳位；畸形 action_id 回执回 echo `req.action_id ?? ''`。

## 已裁定不修（记录在案）

- package-lock resolved 指向 npmmirror：npm 校验完整性哈希，内容固定，区域网络正常选择。
- dev.js EADDRINUSE 原始堆栈：DX 打磨，fail-fast 行为可接受。
- 兄弟 handler 直调 null 载荷：经 mqtt.js 路径不可达（payload 恒为 string），且 index.js 路由兜底 try/catch 已提供第二道防线。

## 战略方向（设计稿 §10，不变）

AI 意图层（自我介绍即 tool schema）、语义自动生成 UI、控制权租约、时序回放、机器人适配器、ESP32 模板库、电视并入（第二块砖）。
