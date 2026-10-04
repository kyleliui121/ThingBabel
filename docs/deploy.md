# 生产部署指南（实验室 Windows 电脑）

目标：中枢 + broker 在实验室电脑上长期常开运行，电视/手机/开发板随时接入。
开发模式（`npm run dev`）仅用于调试，勿当生产。

## 0. 前置

- Node.js LTS（20+）
- 电脑在路由器上做 **DHCP 静态绑定**固定内网 IP（下文以 `192.168.1.100` 代称）
- 防火墙放行入站端口：**3000**（API/SSE）、**1883**（MQTT TCP）、**9001**（MQTT WebSocket）

## 1. 安装 mosquitto（生产 broker）

1. 下载安装 [mosquitto](https://mosquitto.org/download/)（Windows 版）
2. 把 `hub/mosquitto.conf.example` 复制为 mosquitto 配置（服务指向它），要点：
   - `listener 1883` + `protocol mqtt`（开发板/Node）
   - `listener 9001` + `protocol websockets`（电视/浏览器）
   - 生产建议按注释启用一设备一账号（passwd，账号名 = device_id）
3. 服务方式启动（服务管理器里设为自动）

## 2. 部署 hub

```powershell
cd <项目>/hub
npm install --omit=dev
copy config.example.json config.json
# 编辑 config.json：改 adminPassword、jwtSecret（随机串）；按需 retentionDays/staleOfflineMinutes
# 想用 AI 编排则填 llm.apiKey
npm start   # 冒烟：应打印 [mqtt] 已连接 … 与 [api] http://<本机IP>:3000
```

⚠️ config 按 `process.cwd()` 解析，**必须在 hub/ 目录下启动**（pm2 配置里已用 cwd 保证）。

## 3. pm2 守护 + 开机自启

```powershell
npm install -g pm2
pm2 start src/index.js --name lab-hub --cwd <项目>/hub
pm2 save
# 开机自启（Windows）：
npm install -g pm2-windows-startup
pm2-startup install
# 重启电脑后 pm2 自动 resurrect
```

常用：`pm2 logs lab-hub`、`pm2 restart lab-hub`、`pm2 monit`。

## 4. 验收清单

- [ ] `curl -X POST http://192.168.1.100:3000/api/login -H "Content-Type: application/json" -d '{"password":"<你的密码>"}'` 返回 token
- [ ] 电视浏览器打开 `web-screen/index.html?broker=ws://192.168.1.100:9001` 出现设备总览
- [ ] 任一设备上电 → hub 日志出现 `[discovery]` 登记、无重排缓冲丢弃告警
- [ ] `pm2 restart lab-hub` 后设备与最后遥测仍在（数据库持久 + retain 重放）
- [ ] 重启电脑 → 服务自动恢复（pm2 resurrect）
- [ ] 长稳：`npm run soak` 跑一晚，RSS 无持续增长

## 5. 数据备份

全部状态 = `hub/data.db`（+ WAL 文件）。定期复制即可；备份前可先 `pm2 stop lab-hub`
保证一致性（或使用 SQLite 在线备份工具）。`soak.db` 是长稳脚本产物，可删。

## 6. 常见问题

| 症状 | 处置 |
|------|------|
| 设备连不上 1883 | 防火墙；mosquitto 是否监听 0.0.0.0（2.x 默认只听 localhost） |
| 电视页面空白 | 9001 未监听或被防火墙拦；浏览器控制台看 WS 错误 |
| 手机 H5 跨域报错 | 确认走 hub 的 API（自带 CORS），别把 H5 页面直接 file:// 打开 |
| hub 启动即退出提示缺 config.json | 不在 hub/ 目录下启动；pm2 用 `--cwd` |
| AI 编排报 LLM 请求失败 | config.json 的 llm 段 apiKey/模型名；内网需能访问 open.bigmodel.cn |
