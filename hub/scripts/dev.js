// 开发模式：内存 aedes broker + hub 一键起，无需安装 mosquitto
// 1883 = TCP MQTT（开发板 / Node 设备），9001 = WebSocket（浏览器 / 电视，MQTT.js over ws）
import net from 'node:net'
import http from 'node:http'
import { WebSocketServer, createWebSocketStream } from 'ws'
import aedes from 'aedes'

const broker = aedes()

const tcpServer = net.createServer(broker.handle)
const httpServer = http.createServer((req, res) => res.end('lab-broker ws: ws://<host>:9001'))
const wsServer = new WebSocketServer({
  server: httpServer,
  handleProtocols: protocols => (protocols.has('mqtt') ? 'mqtt' : false) // MQTT over WS 必须回显 mqtt 子协议
})
wsServer.on('connection', socket => broker.handle(createWebSocketStream(socket))) // ws 必须包成 Duplex 流（aedes 官方 WS 接法）

tcpServer.listen(1883, async () => {
  console.log('[dev-broker] mqtt://127.0.0.1:1883')
  await import('../src/index.js')
})
httpServer.listen(9001, () => console.log('[dev-broker] ws://127.0.0.1:9001 (浏览器/电视用)'))
