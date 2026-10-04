import test from 'node:test'
import assert from 'node:assert/strict'
import { configWarnings } from '../src/config.js'

test('configWarnings：默认值触发两条告警，自定义值无告警', () => {
  assert.equal(configWarnings({ adminPassword: 'lab123', jwtSecret: 'dev-secret-change-me' }).length, 2)
  assert.equal(configWarnings({ adminPassword: 'lab123', jwtSecret: 'x' }).length, 1)
  assert.equal(configWarnings({ adminPassword: 'y', jwtSecret: 'x' }).length, 0)
})
