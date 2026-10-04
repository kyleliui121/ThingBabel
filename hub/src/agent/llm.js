// LLM 适配器：OpenAI 兼容的 chat/completions（GLM 系，bigmodel.cn）。
// 密钥来自 hub/config.json 的 llm 段；temperature 固定 0 保证实验可复现（论文实验设计 §4.5）
export function createLlm({ baseUrl, apiKey, model, temperature = 0 }) {
  return async function callLLM(messages, tools) {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature, messages, tools, tool_choice: 'auto' })
    })
    if (!res.ok) throw new Error(`LLM 请求失败 ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const m = (await res.json()).choices?.[0]?.message || {}
    return { content: m.content || '', tool_calls: m.tool_calls || [] }
  }
}
