// OTel GenAI 语义约定兼容的轻量 tracer（零依赖，形状对齐 open-telemetry/semantic-conventions-genai）：
// 每次任务一个 trace；root=agent.task，LLM 调用=gen_ai.chat span（gen_ai.* 属性），
// 工具执行=tool span（lab.* 自定义命名空间）；父子以 span_id 串联，结束时整批落库。
import { randomUUID } from 'node:crypto'

const newId = (n = 16) => randomUUID().replace(/-/g, '').slice(0, n)

export function createTrace(rootName, rootAttributes = {}) {
  const traceId = newId(32)
  const spans = []
  const rootCtx = { spanId: null }

  function span(name, attributes = {}, parent = rootCtx) {
    const s = {
      trace_id: traceId,
      span_id: newId(),
      parent_span_id: parent.spanId,
      name,
      kind: 'INTERNAL',
      start_ms: Date.now(),
      end_ms: null,
      attributes_json: null,
      status: 'unset',
      status_message: ''
    }
    return {
      spanId: s.span_id, // 传给后续 span 作 parent
      end(extraAttrs = {}, status = 'ok', statusMessage = '') {
        s.end_ms = Date.now()
        s.attributes_json = JSON.stringify({ ...attributes, ...extraAttrs })
        s.status = status
        s.status_message = statusMessage
        spans.push(s)
      }
    }
  }

  const root = span(rootName, rootAttributes)
  return {
    traceId,
    root,
    span,
    flush(db) {
      if (!db) return 0
      for (const s of spans) db.insertSpan(s)
      return spans.length
    }
  }
}
