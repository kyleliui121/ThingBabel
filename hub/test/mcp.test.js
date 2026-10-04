import test from 'node:test'
import assert from 'node:assert/strict'
import { createMcpHandler } from '../src/mcp.js'

const tools = [
  { name: 'sensor-01__reboot', description: '重启', inputSchema: { type: 'object', properties: {}, required: [] }, dispatch: { device_id: 'sensor-01', action: 'reboot' } }
]
const calls = []
const handler = createMcpHandler({
  tools,
  callTool: (tool, args) => { calls.push({ tool: tool.name, args }); return { status: 'ok', action_id: 'a1' } }
})

test('MCP：initialize / tools/list / tools/call 形状正确', () => {
  const init = handler(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }))
  assert.equal(init.result.protocolVersion, '2024-11-05')
  assert.equal(init.result.serverInfo.name, 'lab-hub-mcp')

  assert.equal(handler(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })), null)

  const list = handler(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }))
  assert.deepEqual(list.result.tools.map(t => t.name), ['sensor-01__reboot'])
  assert.equal(list.result.tools[0].inputSchema.type, 'object')

  const call = handler(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'sensor-01__reboot', arguments: {} } }))
  assert.equal(call.result.isError, false)
  assert.deepEqual(JSON.parse(call.result.content[0].text), { status: 'ok', action_id: 'a1' })
  assert.deepEqual(calls[0], { tool: 'sensor-01__reboot', args: {} })
})

test('MCP：未知方法与未知工具返回 JSON-RPC 错误，坏 JSON 返 -32700', () => {
  assert.equal(handler('not json').error.code, -32700)
  assert.equal(handler(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'nope' })).error.code, -32601)
  assert.equal(handler(JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'ghost' } })).error.code, -32602)
})

test('MCP：工具执行错误透传为 isError=true（离线守卫路径）', () => {
  const h2 = createMcpHandler({
    tools,
    callTool: () => ({ status: 'error', message: '设备 sensor-01 离线' })
  })
  const r = h2(JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'sensor-01__reboot', arguments: {} } }))
  assert.equal(r.result.isError, true)
  assert.match(r.result.content[0].text, /离线/)
})
