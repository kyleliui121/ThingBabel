# lab-hub 中枢

开发：`npm install && cp config.example.json config.json && npm run dev`
（开发模式自带内存 broker，无需 mosquitto；config.json 不入库）

生产（实验室电脑）：安装 mosquitto 并监听 1883 → `npm start`，pm2 守护：
`pm2 start src/index.js --name lab-hub && pm2 save`

测试：`npm test`（内置 aedes，无外部依赖）

## 快速开始（全链路）

三个终端依次启动（首次先在 hub / devices/mock / app 各自 `npm install`）：

```bash
# 终端 1 —— 中枢（含内存 broker，占用 1883 + 3000）
cd hub && npm run dev

# 终端 2 —— 模拟温湿度传感器（无需任何手工配置，上线即自动登记）
cd devices/mock && npm start

# 终端 3 —— 前端 H5（默认 http://localhost:5173）
cd app && npm run dev:h5
```

浏览器验收（对照设计稿 §8 手动清单，人工逐项打勾）：

- [ ] 终端 1 控制台出现 sensor-01 登记日志——设备上线即自动登记，无任何手工配置
- [ ] 打开 H5 → 登录页填服务器地址 `http://<本机局域网IP>:3000`、账号 `admin`、密码 `lab123`（hub/config.json 的 adminPassword）
- [ ] 设备列表出现 sensor-01，带绿色在线圆点
- [ ] 进入详情页：温度/湿度每 5 秒跳动一次
- [ ] 点 reboot → 出现成功 toast；约 2 秒后终端 2 的 mock 重新自我介绍（重新登记）
- [ ] 在终端 2 按 Ctrl+C 杀掉 mock → 列表下拉刷新后 sensor-01 变灰显示"离线"（MQTT 遗嘱 LWT）
- [ ] 重启 hub（保留 data.db）→ 设备与最后遥测仍在（retain 消息重放）

以上 2、6、7 条（登记日志、遗嘱下线、重启后 retain 重放）已于 2026-10-04 在本机用 curl 全链路验证通过（登录→列表遥测→reboot 回执 ok→杀进程离线→重启数据保留）；1、3、4、5 条涉及浏览器视觉效果，留待人工勾选。
