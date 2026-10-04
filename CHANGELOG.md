# Changelog — 版本事实唯一来源

本文件记录每个版本的**实测事实**（测试数量以 `npm test` 输出为准、功能状态、已知边界）。
README、论文文档、汇报材料只引用本文件，不再手写数字——防止多处维护导致的漂移。

从 zip 开始：先在 `hub/`、`5-电脑设备端/mock-sensor/` 各自 `npm install`，否则测试起不来。

## v0.1.1 — 2026-10-04（外部评审加固）

- **63 tests pass（node --test），0 fail**
- P0 安全加固：
  - agent 授权边界——只允许下发设备 discovery 中声明过的动作，幻觉/注入的 `deviceId__anything` 被拒发（含 grouped 模式回归测试）
  - 回执绑定——回执只能结束其指令所属设备的指令（跨设备伪造忽略）；status 枚举校验（协议外值忽略）；未知 action_id 忽略
- 测试确定性：anomaly 测试弃用随机输入，改固定序列（复跑 15 次稳定）
- M2 判定加固：T3 改 sequence 顺序判定（证明组合正确而非调用次数）；T4 引入种子状态做行为判定（条件真→必须动作、条件假→必须不动）；`answer` 兜底判定加最低长度并声明局限（LLM-as-judge 为 W3 升级路径）
- 手机端 app 移除（需求方决定，git 历史可恢复）
- 已知边界：ESP32 固件未硬件验证；LLM 真机调用未验证（待 API key）；`T4-03/05` 判定仍为兜底级

## v0.1.0 — 2026-10-04（生态首版）

- 59 tests pass
- lab-proto v0.1 协议（MQTT 主题树 / 能力三元组 / LWT / 回执超时 / 重排缓冲）
- hub：批量事务写入、SSE 推送、看门狗、按天清理、events API、OTel GenAI 兼容 trace
- AI 编排：discovery→tool schema 零转换映射、规划→dispatch→回执闭环、确认开关、离线守卫
- 评测基建：30 任务集 runner、精确缓存、B2/B4 基线、M5 设备群与批量、M1 成本计量、trace 导出、任务集冻结
- web-screen 电视/浏览器大屏；ESP32 固件模板（未验证）；soak 长稳脚本
- 已知边界：手机端移除前的旧版在 git 历史（`daff481b` 之前）
