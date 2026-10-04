# Changelog — 版本事实唯一来源

本文件记录每个版本的**实测事实**（测试数量以 `npm test` 输出为准、功能状态、已知边界）。
README、论文文档、汇报材料只引用本文件，不再手写数字——防止多处维护导致的漂移。

从 zip 开始：先在 `hub/`、`5-电脑设备端/mock-sensor/` 各自 `npm install`，否则测试起不来。

## v0.1.3 — 2026-10-04（评审第三轮：参数域封闭与回执不变量）

- **67 tests pass（node --test，0 fail）**；静态 `test()` 计数 = 67，与 runner 一致
- 参数域封闭（③）：`validateParams` 拒绝**未声明的额外参数**（`additionalProperties:false` 语义）——`{level:2, hack:true}` 整体拒发；参数级授权从"声明项合法"升级为"传入项 ∈ 声明域"
- 回执不变量（④）：`accept(result) ⟺ action_id 存在 ∧ device_id 匹配 ∧ **action_name 匹配** ∧ status ∈ 枚举 ∧ **指令仍为 pending**`——修复两个暗坑：同设备把回执挂到别的动作主题可伪造成功；迟到回执（timeout 后）不改库却广播"ok"（updateAction 返回实际更新行数作为接受依据）
- 已知边界：ESP32 固件未硬件验证；LLM 真机调用未验证（待 API key）；`T4-03/05` 判定仍为兜底级

## v0.1.2 — 2026-10-04（评审第二轮：参数级授权与判分硬化）

- **65 tests pass（node --test，0 fail）**；静态 `test()` 计数 = 65，与 runner 一致
- 计数勘误：v0.1.1 的"63"含幽灵计数——支撑文件 `test/helpers.js`（0 个测试）被 runner 当成 1 个测试；`npm test` 已改为 glob `test/*.test.js`，计数从此可信
- 参数级授权：`doTool` 在动作名校验之上新增 `validateParams`——required 缺失/数值非法/min/max 越界/enum 越值一律拒发（`rejected`），参数到不了 MQTT；评测 log 携带 params 供判分
- 回执一致性：`onResult` 返回布尔，**拒收的回执不广播 SSE**——修复"DB pending 但 UI 收到 ok"的事实/展示层分裂
- M2 判定硬化（第二轮）：`action`/`sequence` 支持参数断言（level=3 等）；T3 双设备查询入序列；T2/T3/T4 文本消除档位歧义（"最大档（3 档）"等）；fan-01 能力声明补 min/max 使校验有域
- 已知边界：ESP32 固件未硬件验证；LLM 真机调用未验证（待 API key）；`T4-03/05` 判定仍为兜底级（LLM-as-judge 待 W3）

## v0.1.1 — 2026-10-04（外部评审第一轮加固）

- ~~63 tests pass~~ 勘误见 v0.1.2（实为 62 真实测试 + 1 幽灵计数）
- P0 安全加固：
  - agent 授权边界——只允许下发设备 discovery 中声明过的动作，幻觉/注入的 `deviceId__anything` 被拒发（含 grouped 模式回归测试）
  - 回执绑定——回执只能结束其指令所属设备的指令（跨设备伪造忽略）；status 枚举校验（协议外值忽略）；未知 action_id 忽略
- 测试确定性：anomaly 测试弃用随机输入，改固定序列（复跑 15 次稳定）
- M2 判定加固：T3 改 sequence 顺序判定；T4 引入种子状态做行为判定；`answer` 兜底判定加最低长度并声明局限
- 手机端 app 移除（需求方决定，git 历史可恢复）

## v0.1.0 — 2026-10-04（生态首版）

- 59 tests pass
- lab-proto v0.1 协议（MQTT 主题树 / 能力三元组 / LWT / 回执超时 / 重排缓冲）
- hub：批量事务写入、SSE 推送、看门狗、按天清理、events API、OTel GenAI 兼容 trace
- AI 编排：discovery→tool schema 零转换映射、规划→dispatch→回执闭环、确认开关、离线守卫
- 评测基建：30 任务集 runner、精确缓存、B2/B4 基线、M5 设备群与批量、M1 成本计量、trace 导出、任务集冻结
- web-screen 电视/浏览器大屏；ESP32 固件模板（未验证）；soak 长稳脚本
- 已知边界：手机端移除前的旧版在 git 历史（`daff481b` 之前）
