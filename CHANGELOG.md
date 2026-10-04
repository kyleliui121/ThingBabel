# Changelog — 版本事实唯一来源

本文件记录每个版本的**实测事实**（测试数量以 `npm test` 输出为准、功能状态、已知边界）。
README、论文文档、汇报材料只引用本文件，不再手写数字——防止多处维护导致的漂移。

从 zip 开始：先在 `hub/`、`5-电脑设备端/mock-sensor/` 各自 `npm install`，否则测试起不来。

## v0.1.7 — 2026-10-05（评审第五轮：可复现性与 CI）

- **70 tests pass（node --test），0 fail**；静态 `test()` 计数 = 70，与 runner 一致
- **GitHub Actions CI**（`.github/workflows/test.yml`）：Node 20/22/24 矩阵，装依赖 → 生成 config.json → 跑测试 + 登录冒烟——"N tests pass"从作者机器声明变成第三方可验证事实
- **Node 20 兼容修复**：`npm test` 从带引号 glob（Node 22+ 才展开，Node 20 报 Could not find）改为默认发现式；`engines` 钉 node>=20；支撑文件移出 `test/`（`test-support/stack.js`）——目录形式与默认形式的计数不再分裂
- **库代码不杀进程**：`loadConfig` 缺文件改抛错（新增测试），`process.exit` 收敛到 CLI 入口专用 `loadConfigOrExit`；评测 runner 注入 callLLM 时不再触碰 config.json——干净解压环境下全量测试可跑
- 遥测双写 `value_num REAL`（数值属性聚合/曲线可用，非数值存 NULL；旧库 ALTER 自动迁移）
- 回执等待新增 bus 'receipt' 事件通道（即时唤醒，轮询 150ms 降为兜底）——M4 延迟分解数据更干净
- 行尾统一：`.gitattributes`（LF）+ renormalize

## v0.1.6 — 2026-10-05（公开仓内容裁剪）

- 论文与调研文档移出公开仓：`docs/research/`（三份调研报告）与 `docs/paper/`（实验设计、指标口径）转入仓库外私有保管（`private/`，已 gitignore）——防止抢先披露与双盲审稿问题
- 历史清除：上述目录已从**全部提交历史**中移除（git filter-branch + 强制推送），仅浏览旧提交亦不可见
- BACKLOG 的论文线小节改为私有指针；README 中英双语的相关引用同步清理
- **勘误**：本条目在 v0.1.6 当次曾因 filter-branch 工作区重置而丢失，v0.1.7 补录

## v0.1.5 — 2026-10-05（GitHub 开源准备）

- 项目更名 **ThingBabel**（设备各说方言、被普适听懂；协议名 lab-proto 保持不变）；GitHub 仓库 `kyleliui121/ThingBabel`
- README 双语化：中文全文 + English 精要（Highlights / Quick start / How to integrate / Status / Research）
- 68 tests pass（未变，本版为文档与发布准备）

## v0.1.4 — 2026-10-04（评审第四轮：任务集去重与 README 口径）

- **68 tests pass（node --test，0 fail）**；静态 `test()` 计数 = 68，与 runner 一致
- 任务集勘误（①）：`eval/tasks.json` 中 **T2-01~T2-06 曾重复两份**（36 条目/30 唯一，M2 类别均值、overall、CSV、run 次数均被污染）——已去重至 30 条（保留带参数断言的版本）；runner 加载时对重复/缺字段 id **拒绝执行**；新增测试钉住"30 条、id 唯一、5 类 × 6"，防再次混入
- README 口径（②）：删除手机 App 的现行引用（简介/架构图/接入路径），消费者改为 **Web/电视大屏 + CLI/Agent + REST**；手机端仅保留一处迁移注记指向本文件
- 已知边界：ESP32 固件未硬件验证；LLM 真机调用未验证（待 API key）；`T4-03/05` 判定仍为兜底级

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
