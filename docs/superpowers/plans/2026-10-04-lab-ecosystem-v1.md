# 实验室物联网生态 v1（通用层）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通"设备即插即认"全链路——mock 传感器按协议自我介绍，中枢零配置登记，手机 App 实时看到数据并发指令。

**Architecture:** 星型拓扑。中枢 = Express(REST) + mqtt.js(订阅 lab/#) + SQLite(better-sqlite3)，三者跑在同一进程；设备走 MQTT（测试用 aedes 内存 broker，生产用 mosquitto）；手机端 uni-app 走 HTTP 轮询。

**Tech Stack:** Node.js 20+ (ESM)、express、better-sqlite3、mqtt.js、jsonwebtoken、aedes（仅测试/开发）、node:test 内置测试器；uni-app (Vue 3)。

**Spec:** `docs/superpowers/specs/2026-10-04-lab-ecosystem-design.md` + `docs/protocol.md`（协议即宪法，任何实现细节与其冲突时以协议为准）

## Global Constraints

- 开发机 Windows + Git Bash；Node >= 20（Task 1 第一步先 `node -v` 验证）
- hub 全部 ESM（package.json `"type":"module"`）
- 测试不依赖外部 mosquitto：一律用 aedes 内存 broker（随机端口）
- 协议常量：主题前缀 `lab/`；`proto_ver = 1`；指令回执超时 5s（可注入缩短用于测试）
- REST 响应统一 `{code:0,data}` / `{code:非0,message}`；HTTP 状态 400/401/404/500
- API 允许 CORS（uni-app H5 开发期跨域调用）
- 目录：`hub/`、`devices/mock/`、`app/`、`docs/`（monorepo，根级 git）
- 提交信息用中文，格式 `feat:/test:/docs:/chore: ...`
- 每个任务收尾必须 `npm test`（hub 内）全绿再提交

---

### Task 1: hub 项目骨架与数据层

**Files:**
- Create: `hub/package.json`、`hub/.gitignore`、`hub/src/config.js`、`hub/src/db.js`
- Test: `hub/test/db.test.js`

**Interfaces:**
- Produces: `loadConfig(file?)` → config 对象；`createDb(file)` → store 对象，方法：`upsertDevice(d)`、`setOnline(id, online)`、`touch(id)`、`getDevice(id)`、`listDevices()`、`insertTelemetry(deviceId, key, value, ts)`、`latestProps(deviceId)`、`propHistory(deviceId, key, limit)`、`createAction({action_id, device_id, action_name, params_json})`、`updateAction(actionId, {status, message})`、`getAction(actionId)`、`failPendingActions()`、`insertEvent(deviceId, name, payload_json, ts)`

- [ ] **Step 1: 环境检查**

Run: `node -v`
Expected: v20.x 或更高。若低于 20，先升级 Node 再继续。

- [ ] **Step 2: 建骨架文件**

`hub/package.json`：

```json
{
  "name": "lab-hub",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "node --test test/",
    "dev": "node scripts/dev.js",
    "start": "node src/index.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "express": "^4.19.0",
    "jsonwebtoken": "^9.0.2",
    "mqtt": "^5.0.0"
  },
  "devDependencies": {
    "aedes": "^0.51.0"
  }
}
```

`hub/.gitignore`：

```
node_modules/
config.json
data.db
data.db-*
```

- [ ] **Step 3: 写失败测试**

`hub/test/db.test.js`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '../src/db.js'

const intro = {
  proto_ver: 1, device_id: 'sensor-01', name: '实验室温湿度', type: 'sensor',
  description: '', properties: [], actions: [], events: []
}

test('discovery upsert 设备并可查询', () => {
  const db = createDb(':memory:')
  db.upsertDevice({ ...intro, caps_json: JSON.stringify(intro) })
  db.upsertDevice({ ...intro, name: '改名了', caps_json: JSON.stringify(intro) })
  const d = db.getDevice('sensor-01')
  assert.equal(d.name, '改名了')
  assert.equal(d.online, 1)
  assert.equal(db.listDevices().length, 1)
})

test('遥测入库与最新值/历史查询', () => {
  const db = createDb(':memory:')
  db.insertTelemetry('sensor-01', 'temperature', '23.5', '2026-10-04T10:00:00Z')
  db.insertTelemetry('sensor-01', 'temperature', '24.0', '2026-10-04T10:00:05Z')
  db.insertTelemetry('sensor-01', 'humidity', '45', '2026-10-04T10:00:05Z')
  const latest = db.latestProps('sensor-01')
  assert.equal(latest.find(p => p.key === 'temperature').value, '24.0')
  const hist = db.propHistory('sensor-01', 'temperature', 10)
  assert.equal(hist.length, 2)
  assert.equal(hist[0].value, '24.0')
})

test('指令日志状态机：pending→ok，迟到回执不覆盖 timeout', () => {
  const db = createDb(':memory:')
  db.createAction({ action_id: 'a1', device_id: 'sensor-01', action_name: 'reboot', params_json: '{}' })
  db.updateAction('a1', { status: 'ok', message: '' })
  assert.equal(db.getAction('a1').status, 'ok')
  db.createAction({ action_id: 'a2', device_id: 'sensor-01', action_name: 'reboot', params_json: '{}' })
  db.updateAction('a2', { status: 'timeout', message: 'x' })
  db.updateAction('a2', { status: 'ok', message: '' })
  assert.equal(db.getAction('a2').status, 'timeout')
})

test('启动时把 pending 指令清为 timeout', () => {
  const db = createDb(':memory:')
  db.createAction({ action_id: 'a3', device_id: 'sensor-01', action_name: 'reboot', params_json: '{}' })
  db.failPendingActions()
  assert.equal(db.getAction('a3').status, 'timeout')
})
```

- [ ] **Step 4: 跑测试确认失败**

Run: `cd hub && npm install && npm test`
Expected: FAIL（找不到模块 `../src/db.js`）

- [ ] **Step 5: 实现 config.js 与 db.js**

`hub/src/config.js`：

```js
import fs from 'node:fs'
import path from 'node:path'

export function loadConfig(file = 'config.json') {
  const p = path.resolve(process.cwd(), file)
  if (!fs.existsSync(p)) {
    console.error(`缺少配置文件 ${p}，请复制 config.example.json 为 config.json 后修改`)
    process.exit(1)
  }
  const c = JSON.parse(fs.readFileSync(p, 'utf8'))
  return {
    port: c.port ?? 3000,
    mqttUrl: c.mqttUrl ?? 'mqtt://127.0.0.1:1883',
    dbFile: c.dbFile ?? 'data.db',
    adminPassword: c.adminPassword ?? 'lab123',
    jwtSecret: c.jwtSecret ?? 'dev-secret-change-me'
  }
}
```

`hub/src/db.js`：

```js
import Database from 'better-sqlite3'

const now = () => new Date().toISOString()

export function createDb(file = ':memory:') {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL, type TEXT NOT NULL, description TEXT DEFAULT '',
      proto_ver INTEGER NOT NULL, caps_json TEXT NOT NULL,
      online INTEGER NOT NULL DEFAULT 1,
      last_seen TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS telemetry(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, ts TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_telemetry ON telemetry(device_id, key, id);
    CREATE TABLE IF NOT EXISTS actions_log(
      action_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, action_name TEXT NOT NULL,
      params_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending',
      message TEXT DEFAULT '', created_at TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS events(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL, name TEXT NOT NULL, payload_json TEXT NOT NULL, ts TEXT NOT NULL);
  `)

  return {
    upsertDevice(d) {
      db.prepare(`INSERT INTO devices(device_id,name,type,description,proto_ver,caps_json,online,last_seen,created_at,updated_at)
        VALUES(@device_id,@name,@type,@description,@proto_ver,@caps_json,1,@ts,@ts,@ts)
        ON CONFLICT(device_id) DO UPDATE SET
          name=@name, type=@type, description=@description, proto_ver=@proto_ver,
          caps_json=@caps_json, online=1, last_seen=@ts, updated_at=@ts`)
        .run({ ...d, ts: now() })
    },
    setOnline(deviceId, online) {
      db.prepare('UPDATE devices SET online=?, last_seen=?, updated_at=? WHERE device_id=?')
        .run(online ? 1 : 0, now(), now(), deviceId)
    },
    touch(deviceId) {
      db.prepare('UPDATE devices SET last_seen=? WHERE device_id=?').run(now(), deviceId)
    },
    getDevice(id) {
      return db.prepare('SELECT * FROM devices WHERE device_id=?').get(id)
    },
    listDevices() {
      return db.prepare('SELECT * FROM devices ORDER BY device_id').all()
    },
    insertTelemetry(deviceId, key, value, ts) {
      db.prepare('INSERT INTO telemetry(device_id,key,value,ts) VALUES(?,?,?,?)')
        .run(deviceId, key, String(value), ts)
    },
    latestProps(deviceId) {
      return db.prepare(`SELECT key, value, ts FROM telemetry
        WHERE device_id=? AND id IN (SELECT MAX(id) FROM telemetry WHERE device_id=? GROUP BY key)`)
        .all(deviceId, deviceId)
    },
    propHistory(deviceId, key, limit = 100) {
      return db.prepare('SELECT value, ts FROM telemetry WHERE device_id=? AND key=? ORDER BY id DESC LIMIT ?')
        .all(deviceId, key, limit)
    },
    createAction(a) {
      db.prepare(`INSERT INTO actions_log(action_id,device_id,action_name,params_json,status,created_at,updated_at)
        VALUES(@action_id,@device_id,@action_name,@params_json,'pending',@ts,@ts)`)
        .run({ ...a, ts: now() })
    },
    updateAction(actionId, { status, message = '' }) {
      db.prepare(`UPDATE actions_log SET status=?, message=?, updated_at=?
        WHERE action_id=? AND status='pending'`).run(status, message, now(), actionId)
    },
    getAction(actionId) {
      return db.prepare('SELECT * FROM actions_log WHERE action_id=?').get(actionId)
    },
    failPendingActions() {
      db.prepare(`UPDATE actions_log SET status='timeout', message='中枢重启，指令作废', updated_at=?
        WHERE status='pending'`).run(now())
    },
    insertEvent(deviceId, name, payloadJson, ts) {
      db.prepare('INSERT INTO events(device_id,name,payload_json,ts) VALUES(?,?,?,?)')
        .run(deviceId, name, payloadJson, ts)
    }
  }
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `cd hub && npm test`
Expected: 4 个测试 PASS

- [ ] **Step 7: 提交**

```bash
git add hub/
git commit -m "feat(hub): 项目骨架与数据层（devices/telemetry/actions/events）"
```

---

### Task 2: 协议路由与 discovery 登记

**Files:**
- Create: `hub/src/router.js`、`hub/src/handlers/discovery.js`、`hub/test/helpers.js`
- Test: `hub/test/discovery.test.js`

**Interfaces:**
- Consumes: Task 1 的 `createDb`
- Produces: `route(parts, payload, handlers)`（纯函数，主题数组→分发）；`makeHandlers({ db, actions })` → `{discovery(id,payload), status(id,payload), props(id,key,payload), result(id,name,payload), events(id,name,payload)}`；`handleDiscovery(db, deviceId, payload)`；测试助手 `startStack({timeoutMs})` → `{port, db, actions, device, close()}`，`wait(ms)`

- [ ] **Step 1: 写失败测试**

`hub/test/helpers.js`：

```js
import net from 'node:net'
import aedes from 'aedes'
import mqtt from 'mqtt'
import { createDb } from '../src/db.js'
import { createActions } from '../src/actions.js'
import { makeHandlers, route } from '../src/router.js'

export const wait = (ms) => new Promise(r => setTimeout(r, ms))

export async function startStack({ timeoutMs = 200 } = {}) {
  const broker = aedes()
  const server = net.createServer(broker.handle)
  await new Promise(r => server.listen(0, r))
  const port = server.address().port

  const db = createDb(':memory:')
  const hubClient = mqtt.connect(`mqtt://127.0.0.1:${port}`)
  const publish = (t, p, opts = {}) => hubClient.publish(t, p, { qos: 1, ...opts })
  const actions = createActions({ publish, db, timeoutMs })
  const handlers = makeHandlers({ db, actions })

  hubClient.on('connect', () => hubClient.subscribe('lab/#'))
  hubClient.on('message', (t, m) => route(t.split('/'), m.toString(), handlers))

  const device = mqtt.connect(`mqtt://127.0.0.1:${port}`, { clientId: 'test-device' })
  await wait(150)

  return {
    port, db, actions, device, publish,
    close: async () => {
      device.end(true); hubClient.end(true)
      await new Promise(r => server.close(r)); broker.close()
    }
  }
}
```

`hub/test/discovery.test.js`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { startStack, wait } from './helpers.js'

const intro = {
  proto_ver: 1, device_id: 'sensor-01', name: '实验室温湿度', type: 'sensor',
  description: '门口货架',
  properties: [{ key: 'temperature', name: '温度', unit: '°C', type: 'number' }],
  actions: [{ name: 'reboot', description: '重启', params: [] }],
  events: []
}

test('合法 discovery 自动登记设备', async () => {
  const s = await startStack()
  s.device.publish('lab/discovery/sensor-01', JSON.stringify(intro), { retain: true, qos: 1 })
  await wait(200)
  const d = s.db.getDevice('sensor-01')
  assert.ok(d, '设备应已登记')
  assert.equal(d.name, '实验室温湿度')
  assert.equal(d.type, 'sensor')
  assert.equal(d.online, 1)
  await s.close()
})

test('重复 discovery 覆盖旧介绍', async () => {
  const s = await startStack()
  s.device.publish('lab/discovery/sensor-01', JSON.stringify(intro), { retain: true, qos: 1 })
  await wait(150)
  s.device.publish('lab/discovery/sensor-01', JSON.stringify({ ...intro, name: '新名字' }), { retain: true, qos: 1 })
  await wait(150)
  assert.equal(s.db.getDevice('sensor-01').name, '新名字')
  await s.close()
})

test('非法 discovery 被丢弃不崩溃', async () => {
  const s = await startStack()
  s.device.publish('lab/discovery/bad-01', 'not json', { qos: 1 })
  s.device.publish('lab/discovery/bad-02', JSON.stringify({ proto_ver: 1 }), { qos: 1 }) // 缺字段
  s.device.publish('lab/discovery/bad-03', JSON.stringify({ ...intro, device_id: '别的' }), { qos: 1 }) // 与主题不符
  await wait(200)
  assert.equal(s.db.getDevice('bad-01'), undefined)
  assert.equal(s.db.getDevice('bad-02'), undefined)
  assert.equal(s.db.getDevice('bad-03'), undefined)
  await s.close()
})
```

注意：helpers 引用了尚不存在的 `createActions`（Task 4）——本任务先建一个最小占位 `createActions` 返回 `{dispatch(){}, onResult(){}}`，Task 4 替换为真实现。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd hub && npm test`
Expected: FAIL（找不到 `../src/router.js` 等模块）

- [ ] **Step 3: 实现**

`hub/src/handlers/discovery.js`：

```js
// 校验并登记设备自我介绍；非法报文记日志丢弃（协议 §3 处理规则）
export function handleDiscovery(db, deviceId, payload) {
  let msg
  try { msg = JSON.parse(payload) } catch { return warn(deviceId, 'JSON 解析失败') }
  if (typeof msg.proto_ver !== 'number') return warn(deviceId, '缺 proto_ver')
  if (msg.device_id !== deviceId) return warn(deviceId, 'device_id 与主题不一致')
  if (!msg.name || typeof msg.name !== 'string') return warn(deviceId, '缺 name')
  if (!msg.type || typeof msg.type !== 'string') return warn(deviceId, '缺 type')
  for (const k of ['properties', 'actions', 'events'])
    if (!Array.isArray(msg[k])) return warn(deviceId, `${k} 必须是数组`)

  db.upsertDevice({
    device_id: deviceId, name: msg.name, type: msg.type,
    description: msg.description ?? '', proto_ver: msg.proto_ver,
    caps_json: payload
  })
}

function warn(id, reason) {
  console.warn(`[discovery] 丢弃 ${id} 的自我介绍：${reason}`)
}
```

`hub/src/actions.js`（临时占位，Task 4 重写）：

```js
export function createActions() {
  return { dispatch() { throw new Error('not implemented') }, onResult() {} }
}
```

`hub/src/router.js`：

```js
import { handleDiscovery } from './handlers/discovery.js'
import { handleStatus } from './handlers/status.js'
import { handleProps } from './handlers/props.js'
import { handleResult } from './handlers/result.js'
import { handleEvent } from './handlers/event.js'

// 纯函数：把主题分段路由到对应处理器（协议 §2 主题表）
export function route(parts, payload, h) {
  if (parts[0] !== 'lab') return
  if (parts[1] === 'discovery' && parts.length === 3) return h.discovery(parts[2], payload)
  if (parts[1] === 'devices' && parts.length >= 4) {
    const id = parts[2]
    const rest = parts.slice(3)
    if (rest[0] === 'status') return h.status(id, payload)
    if (rest[0] === 'props' && rest.length === 2) return h.props(id, rest[1], payload)
    if (rest[0] === 'actions' && rest.length === 3 && rest[2] === 'result') return h.result(id, rest[1], payload)
    if (rest[0] === 'events' && rest.length === 2) return h.events(id, rest[1], payload)
  }
}

export function makeHandlers({ db, actions }) {
  return {
    discovery: (id, p) => handleDiscovery(db, id, p),
    status: (id, p) => handleStatus(db, id, p),
    props: (id, key, p) => handleProps(db, id, key, p),
    result: (id, name, p) => handleResult(actions, id, name, p),
    events: (id, name, p) => handleEvent(db, id, name, p)
  }
}
```

同时创建其余四个 handler 的最小实现（status/props/result/event，下一任务补齐逻辑）：

`hub/src/handlers/status.js`：

```js
export function handleStatus(db, deviceId, payload) {
  db.setOnline(deviceId, payload.trim() === 'online')
}
```

`hub/src/handlers/props.js`：

```js
export function handleProps() {}
```

`hub/src/handlers/result.js`：

```js
export function handleResult() {}
```

`hub/src/handlers/event.js`：

```js
export function handleEvent() {}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd hub && npm test`
Expected: 全部 PASS（含 Task 1 的 4 个）

- [ ] **Step 5: 提交**

```bash
git add hub/
git commit -m "feat(hub): MQTT 主题路由与 discovery 校验登记"
```

---

### Task 3: 遥测、状态、事件入库

**Files:**
- Modify: `hub/src/handlers/props.js`、`hub/src/handlers/event.js`
- Test: `hub/test/telemetry.test.js`

**Interfaces:**
- Consumes: Task 1 `insertTelemetry/latestProps/insertEvent/touch/setOnline`，Task 2 `startStack`
- Produces: props 载荷为 JSON 标量（`23.5`、`"ok"`、`true`）时原样入库；events 载荷原文入库

- [ ] **Step 1: 写失败测试**

`hub/test/telemetry.test.js`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { startStack, wait } from './helpers.js'

test('props 遥测入库且刷新 last_seen', async () => {
  const s = await startStack()
  s.device.publish('lab/devices/sensor-01/props/temperature', '23.5', { retain: true })
  s.device.publish('lab/devices/sensor-01/props/humidity', '45', { retain: true })
  s.device.publish('lab/devices/sensor-01/props/door', '"open"', { retain: true })
  await wait(200)
  const latest = s.db.latestProps('sensor-01')
  assert.equal(latest.find(p => p.key === 'temperature').value, '23.5')
  assert.equal(latest.find(p => p.key === 'door').value, '"open"')
  await s.close()
})

test('status 遗嘱下线', async () => {
  const s = await startStack()
  s.device.publish('lab/devices/sensor-01/status', 'online', { retain: true })
  await wait(100)
  s.device.publish('lab/devices/sensor-01/status', 'offline', { retain: true })
  await wait(150)
  assert.equal(s.db.getDevice('sensor-01').online, 0)
  await s.close()
})
```

（第一条依赖设备先存在——先发一条 discovery，或在断言前 `s.db.upsertDevice(...)` 造行。本任务实现里 props/status 对未登记设备直接忽略，因此测试先发 discovery。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd hub && npm test`
Expected: 新增测试 FAIL（props 未入库 / status 未生效——因 handler 为空或设备不存在被忽略）

- [ ] **Step 3: 实现**

`hub/src/handlers/props.js`：

```js
// 遥测：JSON 标量原样入库（协议 §4），未知设备忽略
export function handleProps(db, deviceId, key, payload) {
  if (!db.getDevice(deviceId)) return
  db.insertTelemetry(deviceId, key, payload, new Date().toISOString())
  db.touch(deviceId)
}
```

`hub/src/handlers/status.js`（替换 Task 2 版本）：

```js
export function handleStatus(db, deviceId, payload) {
  if (!db.getDevice(deviceId)) return
  db.setOnline(deviceId, payload.trim() === 'online')
}
```

`hub/src/handlers/event.js`：

```js
// 事件：原文入库（协议 §6），未知设备忽略
export function handleEvent(db, deviceId, name, payload) {
  if (!db.getDevice(deviceId)) return
  db.insertEvent(deviceId, name, payload, new Date().toISOString())
  db.touch(deviceId)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd hub && npm test`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add hub/
git commit -m "feat(hub): 遥测/状态/事件入库，未登记设备忽略"
```

---

### Task 4: 指令服务与回执

**Files:**
- Modify: `hub/src/actions.js`（占位替换为真实现）、`hub/src/handlers/result.js`
- Test: `hub/test/actions.test.js`

**Interfaces:**
- Consumes: Task 1 `createAction/updateAction/getAction`
- Produces: `createActions({ publish, db, timeoutMs=5000 })` → `{ dispatch(deviceId, name, params) → {action_id}, onResult(actionId, status, message), }`；result handler 解析 `{action_id,status,message}` 调 `onResult`

- [ ] **Step 1: 写失败测试**

`hub/test/actions.test.js`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { startStack, wait } from './helpers.js'
import { createActions, __test } from '../src/actions.js'

test('dispatch 生成 action_id 并发 MQTT；设备回 ok 后状态更新', async () => {
  const s = await startStack({ timeoutMs: 300 })
  s.device.subscribe('lab/devices/sensor-01/actions/#')
  s.device.on('message', (t, m) => {
    if (t.endsWith('/result')) return
    const req = JSON.parse(m.toString())
    s.device.publish(`${t}/result`, JSON.stringify({ action_id: req.action_id, status: 'ok', message: '' }))
  })
  s.publish('lab/discovery/sensor-01', JSON.stringify({
    proto_ver: 1, device_id: 'sensor-01', name: 't', type: 'sensor',
    properties: [], actions: [], events: []
  }), { retain: true })
  await wait(150)

  const { action_id } = s.actions.dispatch('sensor-01', 'reboot', {})
  await wait(200)
  assert.equal(s.db.getAction(action_id).status, 'ok')
  await s.close()
})

test('5 秒（测试中 300ms）无回执置 timeout', async () => {
  const s = await startStack({ timeoutMs: 300 })
  s.db.upsertDevice({ device_id: 'sensor-01', name: 't', type: 'sensor', description: '', proto_ver: 1, caps_json: '{}' })
  const { action_id } = s.actions.dispatch('sensor-01', 'reboot', {})
  await wait(400)
  assert.equal(s.db.getAction(action_id).status, 'timeout')
  await s.close()
})

test('result 消息走路由更新回执', async () => {
  const s = await startStack({ timeoutMs: 1000 })
  s.db.upsertDevice({ device_id: 'sensor-01', name: 't', type: 'sensor', description: '', proto_ver: 1, caps_json: '{}' })
  const { action_id } = s.actions.dispatch('sensor-01', 'move', { x: 1 })
  s.device.publish('lab/devices/sensor-01/actions/move/result',
    JSON.stringify({ action_id, status: 'error', message: '越界' }))
  await wait(200)
  const a = s.db.getAction(action_id)
  assert.equal(a.status, 'error')
  assert.equal(a.message, '越界')
  await s.close()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd hub && npm test`
Expected: 新增测试 FAIL（dispatch 抛 not implemented）

- [ ] **Step 3: 实现**

`hub/src/actions.js`（整体替换）：

```js
import { randomUUID } from 'node:crypto'

// 指令服务：生成 action_id → 发 MQTT → 等回执，超时置 timeout（协议 §5）
export function createActions({ publish, db, timeoutMs = 5000 }) {
  const timers = new Map()
  return {
    dispatch(deviceId, name, params = {}) {
      const action_id = randomUUID().replace(/-/g, '').slice(0, 12)
      db.createAction({
        action_id, device_id: deviceId, action_name: name,
        params_json: JSON.stringify(params)
      })
      publish(`lab/devices/${deviceId}/actions/${name}`, JSON.stringify({ action_id, params }), { qos: 1 })
      timers.set(action_id, setTimeout(() => {
        timers.delete(action_id)
        db.updateAction(action_id, { status: 'timeout', message: `${timeoutMs / 1000}秒内未收到回执` })
      }, timeoutMs))
      return { action_id }
    },
    onResult(actionId, status, message = '') {
      const t = timers.get(actionId)
      if (t) { clearTimeout(t); timers.delete(actionId) }
      db.updateAction(actionId, { status, message })
    }
  }
}
```

`hub/src/handlers/result.js`：

```js
// 回执：解析 {action_id,status,message}（协议 §5）；非法载荷忽略
export function handleResult(actions, deviceId, name, payload) {
  let msg
  try { msg = JSON.parse(payload) } catch { return }
  if (!msg.action_id || !msg.status) return
  actions.onResult(msg.action_id, msg.status, msg.message ?? '')
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd hub && npm test`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add hub/
git commit -m "feat(hub): 指令下发/回执/超时状态机"
```

---

### Task 5: REST API（登录鉴权 + 设备/遥测/指令）

**Files:**
- Create: `hub/src/api.js`
- Test: `hub/test/api.test.js`

**Interfaces:**
- Consumes: Task 1 store、Task 4 `createActions`
- Produces: `createApi({ db, actions, config })` → Express app；路由见设计稿 §4.4（login / devices / devices/:id / props / history / actions POST / actions/:id 查询）；跨域放行所有来源

- [ ] **Step 1: 写失败测试**

`hub/test/api.test.js`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createApi } from '../src/api.js'
import { createDb } from '../src/db.js'
import { createActions } from '../src/actions.js'

async function startApi() {
  const db = createDb(':memory:')
  const config = { adminPassword: 'pw', jwtSecret: 'test-secret' }
  const actions = createActions({ publish: () => {}, db, timeoutMs: 100 })
  const app = createApi({ db, actions, config })
  const server = app.listen(0)
  await new Promise(r => server.on('listening', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const call = (method, path, body, token) => fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  return { db, base, call, close: () => server.close() }
}

const intro = { proto_ver: 1, device_id: 'sensor-01', name: '温湿度', type: 'sensor', description: '', properties: [{ key: 'temperature', name: '温度', unit: '°C', type: 'number' }], actions: [{ name: 'reboot', description: '重启', params: [] }], events: [] }

test('登录换 token，错误密码 401', async () => {
  const s = await startApi()
  assert.equal((await s.call('POST', '/api/login', { password: 'wrong' })).status, 401)
  const r = await s.call('POST', '/api/login', { password: 'pw' })
  assert.equal(r.status, 200)
  assert.ok((await r.json()).data.token)
  s.close()
})

test('未带 token 访问设备列表 401', async () => {
  const s = await startApi()
  assert.equal((await s.call('GET', '/api/devices')).status, 401)
  s.close()
})

test('设备列表带最新遥测，详情带 caps，历史可查', async () => {
  const s = await startApi()
  const { data: { token } } = await (await s.call('POST', '/api/login', { password: 'pw' })).json()
  s.db.upsertDevice({ ...intro, caps_json: JSON.stringify(intro) })
  s.db.insertTelemetry('sensor-01', 'temperature', '23.5', new Date().toISOString())

  const list = (await (await s.call('GET', '/api/devices', null, token)).json()).data
  assert.equal(list[0].device_id, 'sensor-01')
  assert.equal(list[0].props.temperature.value, '23.5')

  const detail = (await (await s.call('GET', '/api/devices/sensor-01', null, token)).json()).data
  assert.equal(detail.caps.properties[0].key, 'temperature')

  const hist = (await (await s.call('GET', '/api/devices/sensor-01/props/history?key=temperature&limit=10', null, token)).json()).data
  assert.equal(hist.length, 1)
  s.close()
})

test('下发指令返回 action_id，超时后可查状态', async () => {
  const s = await startApi()
  const { data: { token } } = await (await s.call('POST', '/api/login', { password: 'pw' })).json()
  s.db.upsertDevice({ ...intro, caps_json: JSON.stringify(intro) })
  const r = await (await s.call('POST', '/api/devices/sensor-01/actions', { name: 'reboot' }, token)).json()
  assert.ok(r.data.action_id)
  await new Promise(r2 => setTimeout(r2, 200))
  const a = (await (await s.call('GET', `/api/actions/${r.data.action_id}`, null, token)).json()).data
  assert.equal(a.status, 'timeout')
  s.close()
})

test('CORS 头存在（uni-app H5 需要）', async () => {
  const s = await startApi()
  const r = await s.call('GET', '/api/devices')
  assert.equal(r.headers.get('access-control-allow-origin'), '*')
  s.close()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd hub && npm test`
Expected: FAIL（找不到 `../src/api.js`）

- [ ] **Step 3: 实现**

`hub/src/api.js`：

```js
import express from 'express'
import jwt from 'jsonwebtoken'

const wrap = (res, data) => res.json({ code: 0, data })
const fail = (res, status, message) => res.status(status).json({ code: 1, message })

export function createApi({ db, actions, config }) {
  const app = express()
  app.use(express.json())

  // H5 开发期跨域
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  app.post('/api/login', (req, res) => {
    const { password } = req.body || {}
    if (password !== config.adminPassword) return fail(res, 401, '密码错误')
    const token = jwt.sign({ role: 'admin' }, config.jwtSecret, { expiresIn: '7d' })
    return wrap(res, { token })
  })

  app.use('/api', (req, res, next) => {
    const h = req.headers.authorization || ''
    try { jwt.verify(h.replace(/^Bearer /, ''), config.jwtSecret); next() }
    catch { return fail(res, 401, '未登录或登录已过期') }
  })

  const findDevice = (res, id) => {
    const d = db.getDevice(id)
    if (!d) { fail(res, 404, `设备 ${id} 不存在`); return null }
    return d
  }

  app.get('/api/devices', (req, res) => {
    const list = db.listDevices().map(d => ({
      device_id: d.device_id, name: d.name, type: d.type,
      online: !!d.online, last_seen: d.last_seen,
      props: Object.fromEntries(db.latestProps(d.device_id).map(p => [p.key, { value: p.value, ts: p.ts }]))
    }))
    return wrap(res, list)
  })

  app.get('/api/devices/:id', (req, res) => {
    const d = findDevice(res, req.params.id)
    if (!d) return
    let caps = {}
    try { caps = JSON.parse(d.caps_json) } catch {}
    return wrap(res, { device_id: d.device_id, name: d.name, type: d.type, description: d.description, online: !!d.online, last_seen: d.last_seen, caps })
  })

  app.get('/api/devices/:id/props', (req, res) => {
    if (!findDevice(res, req.params.id)) return
    return wrap(res, db.latestProps(req.params.id))
  })

  app.get('/api/devices/:id/props/history', (req, res) => {
    if (!findDevice(res, req.params.id)) return
    const key = String(req.query.key || '')
    if (!key) return fail(res, 400, '缺少 key 参数')
    const limit = Math.min(Number(req.query.limit) || 100, 1000)
    return wrap(res, db.propHistory(req.params.id, key, limit))
  })

  app.post('/api/devices/:id/actions', (req, res) => {
    if (!findDevice(res, req.params.id)) return
    const { name, params } = req.body || {}
    if (!name) return fail(res, 400, '缺少指令名')
    return wrap(res, actions.dispatch(req.params.id, String(name), params || {}))
  })

  app.get('/api/actions/:actionId', (req, res) => {
    const a = db.getAction(req.params.actionId)
    if (!a) return fail(res, 404, '指令不存在')
    return wrap(res, a)
  })

  app.use((err, req, res, next) => {
    console.error('[api]', err)
    return fail(res, 500, '服务器内部错误')
  })

  return app
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd hub && npm test`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add hub/
git commit -m "feat(hub): REST API（登录/设备/遥测/指令）+ CORS"
```

---

### Task 6: 入口、开发 broker 与冒烟

**Files:**
- Create: `hub/src/index.js`、`hub/scripts/dev.js`、`hub/config.example.json`、`hub/README.md`

**Interfaces:**
- Consumes: 前五个任务的全部模块
- Produces: `npm run dev` = 内存 broker(:1883) + hub(API :3000)；`npm start` = 只起 hub（连真 mosquitto）

- [ ] **Step 1: 实现入口**

`hub/src/index.js`：

```js
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

client.on('connect', () => console.log(`[mqtt] 已连接 ${config.mqttUrl}，订阅 lab/#`))
client.on('message', (t, m) => route(t.split('/'), m.toString(), handlers))

const app = createApi({ db, actions, config })
app.listen(config.port, () => console.log(`[api]  http://<本机IP>:${config.port}`))
```

`hub/scripts/dev.js`：

```js
// 开发模式：内存 aedes broker + hub 一键起，无需安装 mosquitto
import net from 'node:net'
import aedes from 'aedes'

const broker = aedes()
const server = net.createServer(broker.handle)
server.listen(1883, async () => {
  console.log('[dev-broker] mqtt://127.0.0.1:1883')
  await import('../src/index.js')
})
```

`hub/config.example.json`：

```json
{
  "port": 3000,
  "mqttUrl": "mqtt://127.0.0.1:1883",
  "dbFile": "data.db",
  "adminPassword": "lab123",
  "jwtSecret": "改成一段随机字符串"
}
```

`hub/README.md`：

```markdown
# lab-hub 中枢

开发：`npm install && cp config.example.json config.json && npm run dev`
（开发模式自带内存 broker，无需 mosquitto；config.json 不入库）

生产（实验室电脑）：安装 mosquitto 并监听 1883 → `npm start`，pm2 守护：
`pm2 start src/index.js --name lab-hub && pm2 save`

测试：`npm test`（内置 aedes，无外部依赖）
```

- [ ] **Step 2: 冒烟验证**

Run:
```bash
cd hub && cp config.example.json config.json && npm run dev &
sleep 3
curl -s -X POST http://127.0.0.1:3000/api/login -H "Content-Type: application/json" -d '{"password":"lab123"}'
```
Expected: 返回 `{"code":0,"data":{"token":"..."}}`；日志显示 broker 与 api 均启动。验证后 `kill %1` 结束。

- [ ] **Step 3: 提交**

```bash
git add hub/
git commit -m "feat(hub): 入口/开发broker/配置样例/README"
```

---

### Task 7: Mock 传感器（协议第一个实现者）

**Files:**
- Create: `devices/mock/package.json`、`devices/mock/mock-sensor.js`
- Test: `hub/test/mock.test.js`（从 hub 侧拉起 mock 验证全链路）

**Interfaces:**
- Consumes: 协议 §3/§4/§5/§7；环境变量 `MQTT_URL`、`DEVICE_ID`
- Produces: `npm start` 即模拟 sensor-01：自我介绍 + 遗嘱 + 每 5 秒温湿度 + reboot 指令回执

- [ ] **Step 1: 写失败测试**

`hub/test/mock.test.js`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { startStack, wait } from './helpers.js'

const root = path.resolve(fileURLToPath(import.meta.url), '../../../')
const mockEntry = path.join(root, 'devices/mock/mock-sensor.js')

test('mock 传感器全链路：登记→遥测→指令回执', async t => {
  const s = await startStack({ timeoutMs: 1000 })
  const child = spawn(process.execPath, [mockEntry], {
    env: { ...process.env, MQTT_URL: `mqtt://127.0.0.1:${s.port}`, DEVICE_ID: 'sensor-mock' },
    stdio: 'ignore'
  })
  t.after(() => { child.kill(); return s.close() })

  await wait(1200)
  const d = s.db.getDevice('sensor-mock')
  assert.ok(d, '应自动登记')
  assert.equal(d.type, 'sensor')

  await wait(5000)
  const latest = s.db.latestProps('sensor-mock')
  assert.ok(latest.find(p => p.key === 'temperature'), '应有温度数据')

  const { action_id } = s.actions.dispatch('sensor-mock', 'reboot', {})
  await wait(600)
  assert.equal(s.db.getAction(action_id).status, 'ok')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd hub && npm test`
Expected: 新增测试 FAIL（mock-sensor.js 不存在）

- [ ] **Step 3: 实现**

`devices/mock/package.json`：

```json
{
  "name": "mock-sensor",
  "version": "0.1.0",
  "type": "module",
  "scripts": { "start": "node mock-sensor.js" },
  "dependencies": { "mqtt": "^5.0.0" }
}
```

`devices/mock/mock-sensor.js`：

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd hub && npm install ../devices/mock --no-save 2>/dev/null; npm test`
（若 mock 依赖未安装导致 mqtt 模块解析失败，改为在 `devices/mock` 下 `npm install` 后回到 hub 再跑。）
Expected: 全部 PASS（含 mock 全链路）

- [ ] **Step 5: 提交**

```bash
git add hub/ devices/
git commit -m "feat(mock): 协议参考实现传感器（discovery/遥测/回执/遗嘱）"
```

---

### Task 8: App 骨架、请求封装与登录页

**Files:**
- Create: `app/`（uni-app Vue3 项目，scaffold 见 Step 1）、`app/src/utils/request.js`、`app/src/pages/login/login.vue`、`app/src/pages.json`、`app/src/manifest.json`

**Interfaces:**
- Consumes: Task 5 REST API（`POST /api/login`）
- Produces: `request(method, path, data?)` → Promise<data>，自动拼 `baseUrl`、带 token、401 跳登录、失败 reject Error；storage 键：`baseUrl`、`token`

**说明**：uni-app 页面层不做自动化测试（v1 接受的取舍，hub 层已覆盖协议与 API）。本任务验证方式 = `npm run dev:h5` 浏览器手动走通。

- [ ] **Step 1: 脚手架**

Run: `cd /d/apps && npx degit dcloudio/uni-preset-vue#vite app`
（网络不通则改用 HBuilderX 新建 uni-app Vue3 空项目到 `app/`。）
然后 `cd app && npm install`。

- [ ] **Step 2: 请求封装**

`app/src/utils/request.js`：

```js
// 统一请求：baseUrl + token 自动携带；401 清 token 回登录页
export function request(method, path, data) {
  const base = uni.getStorageSync('baseUrl') || ''
  return new Promise((resolve, reject) => {
    uni.request({
      url: base + path,
      method,
      data,
      header: { Authorization: `Bearer ${uni.getStorageSync('token') || ''}` },
      success: res => {
        if (res.statusCode === 401) {
          uni.removeStorageSync('token')
          uni.reLaunch({ url: '/pages/login/login' })
          return reject(new Error('未登录'))
        }
        const body = res.data || {}
        if (body.code !== 0) return reject(new Error(body.message || '请求失败'))
        resolve(body.data)
      },
      fail: () => reject(new Error('无法连接服务器，请检查地址与网络'))
    })
  })
}

export const setBase = url => uni.setStorageSync('baseUrl', url.replace(/\/+$/, ''))
export const setToken = t => uni.setStorageSync('token', t)
export const getBase = () => uni.getStorageSync('baseUrl') || ''
```

- [ ] **Step 3: 页面配置**

`app/src/pages.json`：

```json
{
  "pages": [
    { "path": "pages/login/login", "style": { "navigationBarTitleText": "实验室中枢" } },
    { "path": "pages/devices/devices", "style": { "navigationBarTitleText": "设备", "enablePullDownRefresh": true } },
    { "path": "pages/device/device", "style": { "navigationBarTitleText": "设备详情" } }
  ],
  "globalStyle": { "navigationBarTextStyle": "white", "navigationBarBackgroundColor": "#1f2937" }
}
```

`app/src/pages/login/login.vue`：

```vue
<template>
  <view class="page">
    <view class="title">实验室万物互联</view>
    <input class="input" v-model="baseUrl" placeholder="中枢地址 http://192.168.x.x:3000" />
    <input class="input" v-model="password" placeholder="密码" password />
    <button class="btn" :loading="loading" @click="login">进入生态</button>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { request, setBase, setToken, getBase } from '../../utils/request.js'

const baseUrl = ref(getBase() || 'http://127.0.0.1:3000')
const password = ref('')
const loading = ref(false)

async function login() {
  if (!baseUrl.value || !password.value) return uni.showToast({ title: '地址和密码都要填', icon: 'none' })
  loading.value = true
  try {
    setBase(baseUrl.value)
    const { token } = await request('POST', '/api/login', { password: password.value })
    setToken(token)
    uni.reLaunch({ url: '/pages/devices/devices' })
  } catch (e) {
    uni.showToast({ title: e.message, icon: 'none' })
  } finally {
    loading.value = false
  }
}
</script>

<style>
.page { padding: 120rpx 60rpx; }
.title { font-size: 44rpx; font-weight: bold; text-align: center; margin-bottom: 80rpx; }
.input { border: 1rpx solid #d1d5db; border-radius: 12rpx; padding: 20rpx; margin-bottom: 30rpx; }
.btn { background: #1f2937; color: #fff; margin-top: 40rpx; }
</style>
```

（另建空占位 `pages/devices/devices.vue`、`pages/device/device.vue`，内容 `<template><view /></template>`，避免路由报错。）

- [ ] **Step 4: 手动验证**

Run: `cd hub && npm run dev &`；`cd app && npm run dev:h5`
浏览器打开 H5 地址：填 `http://127.0.0.1:3000` + `lab123` → 跳转到空白设备页；填错密码 → toast "密码错误"；地址填错 → toast "无法连接服务器"。

- [ ] **Step 5: 提交**

```bash
git add app/
git commit -m "feat(app): uni-app 骨架、请求封装与登录页"
```

---

### Task 9: 设备列表页

**Files:**
- Modify: `app/src/pages/devices/devices.vue`

**Interfaces:**
- Consumes: `GET /api/devices` → `[{device_id, name, type, online, last_seen, props: {key:{value,ts}}}]`
- Produces: 列表项点击跳 `/pages/device/device?id=xxx`

- [ ] **Step 1: 实现**

```vue
<template>
  <view class="page">
    <view v-for="d in devices" :key="d.device_id" class="card" @click="go(d)">
      <view class="row">
        <view class="dot" :class="d.online ? 'on' : 'off'" />
        <text class="name">{{ d.name }}</text>
        <text class="type">{{ d.type }}</text>
      </view>
      <view class="props">
        <text v-for="(v, k) in d.props" :key="k" class="prop">{{ k }}: {{ v.value }}</text>
        <text v-if="!Object.keys(d.props).length" class="prop muted">暂无数据</text>
      </view>
      <view class="id">{{ d.device_id }} · {{ d.online ? '在线' : '离线' }}</view>
    </view>
    <view v-if="!devices.length" class="empty">还没有设备接入——跑一个 mock 传感器试试</view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { request } from '../../utils/request.js'
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'

const devices = ref([])

async function load() {
  try { devices.value = await request('GET', '/api/devices') }
  catch (e) { uni.showToast({ title: e.message, icon: 'none' }) }
}

function go(d) {
  uni.navigateTo({ url: `/pages/device/device?id=${d.device_id}` })
}

onShow(load)
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh() })
</script>

<style>
.page { padding: 24rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 28rpx; margin-bottom: 24rpx; }
.row { display: flex; align-items: center; }
.dot { width: 18rpx; height: 18rpx; border-radius: 50%; margin-right: 16rpx; }
.on { background: #22c55e; }
.off { background: #9ca3af; }
.name { font-size: 32rpx; font-weight: bold; flex: 1; }
.type { font-size: 24rpx; color: #6b7280; background: #f3f4f6; padding: 4rpx 16rpx; border-radius: 8rpx; }
.props { display: flex; flex-wrap: wrap; margin-top: 16rpx; }
.prop { font-size: 26rpx; color: #374151; margin-right: 32rpx; }
.muted { color: #9ca3af; }
.id { font-size: 22rpx; color: #9ca3af; margin-top: 12rpx; }
.empty { text-align: center; color: #9ca3af; margin-top: 200rpx; }
</style>
```

- [ ] **Step 2: 手动验证**

hub dev + mock 传感器 + H5：登录后列表出现 `sensor-01`（绿点、温度湿度数字）；杀掉 mock 进程 → 下拉刷新后变灰"离线"。

- [ ] **Step 3: 提交**

```bash
git add app/
git commit -m "feat(app): 设备列表页（在线状态+遥测摘要）"
```

---

### Task 10: 设备详情页（实时数据 + 指令）

**Files:**
- Modify: `app/src/pages/device/device.vue`

**Interfaces:**
- Consumes: `GET /api/devices/:id`（含 caps）、`GET /api/devices/:id/props`、`POST /api/devices/:id/actions`、`GET /api/actions/:id`

- [ ] **Step 1: 实现**

```vue
<template>
  <view class="page" v-if="device">
    <view class="head">
      <text class="name">{{ device.name }}</text>
      <text class="sub">{{ device.device_id }} · {{ device.online ? '在线' : '离线' }}</text>
    </view>

    <view class="section">实时数据（3 秒自动刷新）</view>
    <view class="card" v-for="p in caps.properties" :key="p.key">
      <text class="label">{{ p.name }}</text>
      <text class="value">{{ props[p.key]?.value ?? '—' }} {{ p.unit }}</text>
      <text class="ts">{{ props[p.key]?.ts || '' }}</text>
    </view>

    <view class="section">指令</view>
    <view class="actions">
      <button v-for="a in caps.actions" :key="a.name" class="btn" @click="doAction(a)">{{ a.description || a.name }}</button>
      <text v-if="!caps.actions?.length" class="muted">该设备没有声明指令</text>
    </view>
  </view>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { request } from '../../utils/request.js'

const device = ref(null)
const caps = ref({ properties: [], actions: [] })
const props = ref({})
let id = ''
let timer = null

onLoad(async q => {
  id = q.id
  await loadDetail()
  timer = setInterval(loadProps, 3000)
})
onUnmounted(() => clearInterval(timer))

async function loadDetail() {
  try {
    device.value = await request('GET', `/api/devices/${id}`)
    caps.value = device.value.caps || { properties: [], actions: [] }
    await loadProps()
  } catch (e) { uni.showToast({ title: e.message, icon: 'none' }) }
}

async function loadProps() {
  try {
    const list = await request('GET', `/api/devices/${id}/props`)
    props.value = Object.fromEntries(list.map(p => [p.key, { value: p.value, ts: p.ts }]))
  } catch {}
}

async function doAction(a) {
  try {
    const { action_id } = await request('POST', `/api/devices/${id}/actions`, { name: a.name })
    uni.showLoading({ title: '执行中' })
    for (let i = 0; i < 6; i++) {                       // 3 秒内每 500ms 轮询回执
      await new Promise(r => setTimeout(r, 500))
      const st = await request('GET', `/api/actions/${action_id}`)
      if (st.status !== 'pending') {
        uni.hideLoading()
        return uni.showToast({ title: `指令${st.status === 'ok' ? '成功' : '失败：' + (st.message || st.status)}`, icon: 'none' })
      }
    }
    uni.hideLoading()
    uni.showToast({ title: '执行超时', icon: 'none' })
  } catch (e) { uni.hideLoading(); uni.showToast({ title: e.message, icon: 'none' }) }
}
</script>

<style>
.page { padding: 24rpx; }
.head { margin: 20rpx 8rpx 30rpx; }
.name { font-size: 40rpx; font-weight: bold; display: block; }
.sub { font-size: 24rpx; color: #6b7280; }
.section { font-size: 26rpx; color: #6b7280; margin: 24rpx 8rpx 12rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 28rpx; margin-bottom: 20rpx; display: flex; align-items: baseline; }
.label { font-size: 28rpx; color: #374151; width: 180rpx; }
.value { font-size: 44rpx; font-weight: bold; flex: 1; }
.ts { font-size: 20rpx; color: #9ca3af; }
.actions { display: flex; flex-wrap: wrap; gap: 16rpx; }
.btn { background: #1f2937; color: #fff; font-size: 26rpx; margin: 0; }
.muted { color: #9ca3af; font-size: 26rpx; }
</style>
```

- [ ] **Step 2: 手动验证**

列表点进 sensor-01：温湿度卡片数字每 3 秒跳动；点"重启"→ toast"指令成功"；hub 停掉 → toast 提示连接失败但不崩溃。

- [ ] **Step 3: 提交**

```bash
git add app/
git commit -m "feat(app): 设备详情页（实时遥测+指令下发）"
```

---

### Task 11: 里程碑端到端验收

**Files:**
- Modify: `hub/README.md`（补充快速开始全链路）

**Interfaces:**
- Consumes: 全部

- [ ] **Step 1: 自动化回归**

Run: `cd hub && npm test`
Expected: 全绿（含 mock 全链路测试）

- [ ] **Step 2: 手动验收清单（对照设计稿 §8）**

依次执行并记录结果：
1. `hub: npm run dev` + `devices/mock: npm start`（两个终端）
2. hub 控制台出现 sensor-01 登记日志，无任何手工配置
3. H5/真机：登录 → 列表出现 sensor-01 绿点 → 详情页数据跳动
4. 点 reboot → 成功 toast，2 秒后 mock 重新自我介绍
5. `Ctrl+C` 杀 mock → 列表下拉刷新变灰"离线"（遗嘱）
6. 重启 hub（保留 data.db）→ 设备与最后遥测仍在（retain 重放）

任何一条不过：修复后重跑本清单。

- [ ] **Step 3: 提交**

```bash
git add hub/README.md
git commit -m "docs: 里程碑一验收通过，快速开始指南"
```

---

## Self-Review 记录

- 覆盖检查：设计稿 §4（hub：Task 1-6）、§5（mock：Task 7）、§6（app：Task 8-10）、§8（验收：Task 7 自动 + Task 11 手动）、§7 错误处理（非法报文 Task 2、超时 Task 4、重启恢复 Task 6、遗嘱 Task 3/7）——全覆盖。§4.4 中 `GET /api/devices/:id/props/history` 在 Task 5 实现（App 曲线图为押后项，接口先留）。
- 类型一致性：`createDb` 方法名在 Task 1 定义、Task 2-5 消费处逐一核对一致；`startStack` 返回 `{port, db, actions, device, close, publish}` 各测试用法一致。
- 占位符扫描：Task 2 的 actions 占位已显式声明并要求 Task 4 替换，无其他 TBD。
