import test from 'node:test'
import assert from 'node:assert/strict'
import { capsToTools, buildRegistry } from '../src/agent/map.js'
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
