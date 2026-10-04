// B4 基线（实验设计 v0.2 §4.3）：MCP server——模拟 IoT-MCP / ThingsBoard MCP bridge 式接入。
// 关键性质：工具必须逐台"手工注册"（无 discovery 零转换映射），这正是 B4 要量的"标准生态接入成本"。
// 传输：stdio 上的 JSON-RPC 2.0（MCP 协议形状：initialize / tools/list / tools/call）。
// createMcpHandler 为纯函数可直测；startMcpStdio 是进程包装。
export function createMcpHandler({ tools, callTool, serverInfo = { name: 'lab-hub-mcp', version: '0.1.0' } }) {
  const reply = (id, result) => ({ jsonrpc: '2.0', id, result })
  const err = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })

  return function handle(msg) {
    let req
    try { req = JSON.parse(msg) } catch { return err(null, -32700, 'Parse error') }
    const { id, method, params } = req
    switch (method) {
      case 'initialize':
        return reply(id, { protocolVersion: params?.protocolVersion || '2024-11-05', capabilities: { tools: {} }, serverInfo })
      case 'notifications/initialized':
        return null // 通知不回包
      case 'ping':
        return reply(id, {})
      case 'tools/list':
        return reply(id, { tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) })
      case 'tools/call': {
        const tool = tools.find(t => t.name === params?.name)
        if (!tool) return err(id, -32602, `未知工具 ${params?.name}`)
        const out = callTool(tool, params?.arguments || {})
        return reply(id, { content: [{ type: 'text', text: JSON.stringify(out) }], isError: out.status !== 'ok' })
      }
      default:
        return id == null ? null : err(id, -32601, `Method not found: ${method}`)
    }
  }
}

export function startMcpStdio(handler) {
  const write = (obj) => { if (obj) process.stdout.write(JSON.stringify(obj) + '\n') }
  let buf = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', chunk => {
    buf += chunk
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1)
      if (line.trim()) write(handler(line))
    }
  })
  process.stdin.on('end', () => process.exit(0))
}
