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
