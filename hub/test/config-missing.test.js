import test from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from '../src/config.js'

test('loadConfig 缺文件时抛错而不是杀进程（库代码不 exit，评审第五轮）', () => {
  assert.throws(() => loadConfig('definitely-missing-config.json'), /缺少配置文件/)
})
