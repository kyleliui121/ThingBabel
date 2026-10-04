import test from 'node:test'
import assert from 'node:assert/strict'
import { capsToTools, buildRegistry, selectTools } from '../src/agent/map.js'
import { createDb } from '../src/db.js'

const caps = {
  proto_ver: 1, device_id: 'arm-01', name: '机械臂', type: 'arm',
  properties: [], events: [],
  actions: [{
    name: 'move', description: '移动到指定位置',
    params: [
      { name: 'x', type: 'number', required: true, min: 0 },
      { name: 'mode', type: 'enum', enum: ['fast', 'slow'] }
    ]
  }]
}

test('映射规则：action → tool，类型/枚举/必填/上下界正确映射', () => {
  const tools = capsToTools(caps, 'arm-01')
  assert.equal(tools.length, 1)
  const f = tools[0].function
  assert.equal(f.name, 'arm-01__move')
  assert.equal(f.description, '[机械臂] 移动到指定位置')
  assert.equal(f.parameters.properties.x.type, 'number')
  assert.equal(f.parameters.properties.x.minimum, 0)
  assert.equal(f.parameters.properties.mode.type, 'string') // 白名单外类型降级 string
  assert.deepEqual(f.parameters.properties.mode.enum, ['fast', 'slow'])
  assert.deepEqual(f.parameters.required, ['x'])
})

test('buildRegistry：内置状态工具 + 设备工具 + prompt 含遥测快照', () => {
  const db = createDb(':memory:')
  db.upsertDevice({ device_id: 'arm-01', name: '机械臂', type: 'arm', description: '', proto_ver: 1, caps_json: JSON.stringify(caps) })
  db.insertTelemetry('arm-01', 'position', '12.5', new Date().toISOString())

  const reg = buildRegistry(db)
  assert.ok(reg.tools.some(t => t.function.name === 'lab_get_device_state'))
  assert.ok(reg.tools.some(t => t.function.name === 'arm-01__move'))
  assert.match(reg.prompt, /机械臂/)
  assert.match(reg.prompt, /12\.5/)
  assert.match(reg.prompt, /在线/)
})

test('selectTools：任务提及某设备 → 只留该设备工具+内建工具；无命中回退全量', () => {
  const db = createDb(':memory:')
  const mk = (id, name, type, actions) => db.upsertDevice({
    device_id: id, name, type, description: '', proto_ver: 1,
    caps_json: JSON.stringify({ proto_ver: 1, device_id: id, name, type, properties: [], actions, events: [] })
  })
  mk('sensor-01', '温湿度', 'sensor', [{ name: 'reboot', description: '重启', params: [] }])
  mk('fan-01', '风扇', 'actuator', [{ name: 'set_speed', description: '调速', params: [] }])
  mk('arm-01', '机械臂', 'arm', [{ name: 'move', description: '移动', params: [] }])
  const all = buildRegistry(db).tools
  assert.equal(all.length, 5) // 状态工具 + 事件工具 + 3 设备工具

  const hit = selectTools(db, '把风扇 fan-01 调到 2 档', all)
  assert.deepEqual(hit.map(t => t.function.name).sort(), ['fan-01__set_speed', 'lab_get_device_state', 'lab_get_recent_events'])

  const byType = selectTools(db, '重启所有 sensor 设备', all) // type 字面命中
  assert.ok(byType.some(t => t.function.name === 'sensor-01__reboot'))
  assert.ok(!byType.some(t => t.function.name === 'arm-01__move'))

  const fallback = selectTools(db, '现在实验室情况怎么样', all)
  assert.equal(fallback.length, all.length)
})
