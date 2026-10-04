import mqtt from 'mqtt'

const URL = process.env.MQTT_URL || 'mqtt://127.0.0.1:1883'
const ID = process.env.DEVICE_ID || 'sensor-01'

const intro = {
  proto_ver: 1,
  device_id: ID,
  name: '实验室温湿度（模拟）',
  type: 'sensor',
  description: 'mock 设备：随机游走的温湿度',
  properties: [
    { key: 'temperature', name: '温度', unit: '°C', type: 'number' },
    { key: 'humidity', name: '湿度', unit: '%', type: 'number' }
  ],
  actions: [{ name: 'reboot', description: '重启设备', params: [] }],
  events: []
}

const client = mqtt.connect(URL, {
  clientId: ID,
  will: { topic: `lab/devices/${ID}/status`, payload: 'offline', retain: true, qos: 1 } // 协议 §7 遗嘱
})

let temp = 23.0, hum = 45.0

client.on('connect', () => {
  client.publish(`lab/discovery/${ID}`, JSON.stringify(intro), { retain: true, qos: 1 })
  client.publish(`lab/devices/${ID}/status`, 'online', { retain: true, qos: 1 })
  client.subscribe(`lab/devices/${ID}/actions/+`)
  setInterval(publishTelemetry, 5000)
})

function publishTelemetry() {
  temp += (Math.random() - 0.5) * 0.4
  hum = Math.max(0, Math.min(100, hum + (Math.random() - 0.5)))
  client.publish(`lab/devices/${ID}/props/temperature`, temp.toFixed(1), { retain: true })   // 协议 §4
  client.publish(`lab/devices/${ID}/props/humidity`, Math.round(hum).toString(), { retain: true })
}

client.on('message', (topic, msg) => {
  const m = topic.match(/^lab\/devices\/[^/]+\/actions\/([^/]+)$/)
  if (!m) return
  let req = {}
  try { req = JSON.parse(msg.toString()) } catch {}
  const reply = (status, message = '') =>
    client.publish(`${topic}/result`, JSON.stringify({ action_id: req.action_id, status, message }), { qos: 1 })
  if (m[1] === 'reboot') {
    reply('ok')
    setTimeout(() => client.publish(`lab/discovery/${ID}`, JSON.stringify(intro), { retain: true, qos: 1 }), 2000)
  } else {
    reply('rejected', `未知指令 ${m[1]}`)
  }
})

client.on('error', e => console.error('[mock]', e.message))
