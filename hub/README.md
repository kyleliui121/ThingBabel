# lab-hub 中枢

开发：`npm install && cp config.example.json config.json && npm run dev`
（开发模式自带内存 broker，无需 mosquitto；config.json 不入库）

生产（实验室电脑）：安装 mosquitto 并监听 1883 → `npm start`，pm2 守护：
`pm2 start src/index.js --name lab-hub && pm2 save`

测试：`npm test`（内置 aedes，无外部依赖）
