// M5 规模化设备群：向外部 broker 拉起 N 台虚拟传感器（对照 soak.js 的自包含模式，这里连正在运行的 hub）
// 用法：FLEET_SIZE=100 node scripts/fleet.js   （默认 50 台，Ctrl+C 退出）
//      FLEET_SIZE=10 FLEET_MINUTES=5 node scripts/fleet.js
import mqtt from 'mqtt'

const URL = process.env.MQTT_URL || 'mqtt://127.0.0.1:1883'
const N = Number(process.env.FLEET_SIZE || 50)
const MINUTES = Number(process.env.FLEET_MINUTES || 0) // 0 = 一直跑到 Ctrl+C
const clients = []

for (let i = 1; i <= N; i++) {
  const id = `fleet-sensor-${String(i).padStart(3, '0')}`
  const intro = {
    proto_ver: 1, device_id: id, name: `群传感器 ${i}`, type: 'sensor',
    description: 'M5 工具数扩展实验用虚拟设备',
    properties: [
      { key: 'temperature', name: '温度', unit: '°C', type: 'number' },
      { key: 'humidity', name: '湿度', unit: '%', type: 'number' }
    ],
    actions: [{ name: 'reboot', description: '重启设备', params: [] }],
    events: []
  }
  const c = mqtt.connect(URL, {
    clientId: id,
    will: { topic: `lab/devices/${id}/status`, payload: 'offline', retain: true, qos: 1 }
  })
  let temp = 20 + Math.random() * 8, hum = 40 + Math.random() * 15, timer = null
  c.on('connect', () => {
    c.publish(`lab/discovery/${id}`, JSON.stringify(intro), { retain: true, qos: 1 })
    c.publish(`lab/devices/${id}/status`, 'online', { retain: true, qos: 1 })
    c.subscribe(`lab/devices/${id}/actions/+`)
    if (!timer) timer = setInterval(() => {
      temp = Math.max(-40, Math.min(85, temp + (Math.random() - 0.5) * 0.4))
      hum = Math.max(0, Math.min(100, hum + (Math.random() - 0.5)))
      c.publish(`lab/devices/${id}/props/temperature`, temp.toFixed(1), { retain: true })
      c.publish(`lab/devices/${id}/props/humidity`, Math.round(hum).toString(), { retain: true })
    }, 5000)
  })
  c.on('message', (topic, msg) => { // 回执：ok 即可（M5 只关心工具数量维度）
    let req = {}
    try { req = JSON.parse(msg.toString()) } catch {}
    c.publish(`${topic}/result`, JSON.stringify({ action_id: req.action_id, status: 'ok', message: '' }), { qos: 1 })
  })
  clients.push(c)
}
console.log(`[fleet] ${N} 台设备已向 ${URL} 上线（每 5 秒遥测）`)

const shutdown = () => { for (const c of clients) c.end(true); process.exit(0) }
if (MINUTES > 0) setTimeout(shutdown, MINUTES * 60000)
process.on('SIGINT', shutdown)
