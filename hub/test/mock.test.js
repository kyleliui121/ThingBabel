import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { startStack, waitFor } from '../test-support/stack.js'

const root = path.resolve(fileURLToPath(import.meta.url), '../../../')
const mockEntry = path.join(root, 'devices/mock/mock-sensor.js')

test('mock 传感器全链路：登记→遥测→指令回执', async t => {
  const s = await startStack({ timeoutMs: 1000 })
  const child = spawn(process.execPath, [mockEntry], {
    env: { ...process.env, MQTT_URL: `mqtt://127.0.0.1:${s.port}`, DEVICE_ID: 'sensor-mock' },
    stdio: 'ignore'
  })
  t.after(() => { child.kill(); return s.close() })

  // 条件等待替代固定 sleep：CI 慢机器上固定时间会踩空（评审第五轮 CI 实测）
  const d = await waitFor(() => s.db.getDevice('sensor-mock'), { label: 'sensor-mock 登记' })
  assert.equal(d.type, 'sensor')

  await waitFor(
    () => s.db.latestProps('sensor-mock').find(p => p.key === 'temperature'),
    { timeoutMs: 15000, label: '首拍温度遥测' }
  )

  const { action_id } = s.actions.dispatch('sensor-mock', 'reboot', {})
  await waitFor(() => s.db.getAction(action_id).status !== 'pending', { timeoutMs: 5000, label: 'reboot 回执' })
  assert.equal(s.db.getAction(action_id).status, 'ok')
})
