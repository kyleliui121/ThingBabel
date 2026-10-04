import mqtt from 'mqtt'
import { loadConfig } from './config.js'
import { createDb } from './db.js'
import { createActions } from './actions.js'
import { makeHandlers, route } from './router.js'
import { createApi } from './api.js'

const config = loadConfig()
const db = createDb(config.dbFile)
db.failPendingActions() // 重启时清空悬挂指令（设计稿 §7）

const client = mqtt.connect(config.mqttUrl)
const actions = createActions({
  publish: (t, p, opts) => client.publish(t, p, { qos: 1, ...opts }),
  db, timeoutMs: 5000
})
const handlers = makeHandlers({ db, actions })

client.on('connect', () => {
  client.subscribe('lab/#') // 简报漏写实际订阅，仅凭日志无法收消息；补上（与 test/helpers.js 一致）
  console.log(`[mqtt] 已连接 ${config.mqttUrl}，订阅 lab/#`)
})
client.on('message', (t, m) => route(t.split('/'), m.toString(), handlers))

const app = createApi({ db, actions, config })
app.listen(config.port, () => console.log(`[api]  http://<本机IP>:${config.port}`))
