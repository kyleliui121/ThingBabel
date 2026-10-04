// 开发模式：内存 aedes broker + hub 一键起，无需安装 mosquitto
import net from 'node:net'
import aedes from 'aedes'

const broker = aedes()
const server = net.createServer(broker.handle)
server.listen(1883, async () => {
  console.log('[dev-broker] mqtt://127.0.0.1:1883')
  await import('../src/index.js')
})
