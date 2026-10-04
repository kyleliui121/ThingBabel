// 评测期精确缓存（实验设计 v0.2 §3.3 纪律②）：以 (messages, tools) 的 JSON 指纹为 key。
// temperature=0 下同前缀必得同响应，k 次重复实验的 LLM 成本砍大半；语义缓存明确不用（评测污染）
import { createHash } from 'node:crypto'

export function withExactCache(callLLM) {
  const store = new Map()
  const stats = { hits: 0, misses: 0 }
  const wrapped = async (messages, tools) => {
    const key = createHash('sha256').update(JSON.stringify([messages, tools])).digest('hex')
    if (store.has(key)) { stats.hits++; return store.get(key) }
    stats.misses++
    const res = await callLLM(messages, tools)
    store.set(key, res)
    return res
  }
  return Object.assign(wrapped, { stats, clear: () => { store.clear(); stats.hits = 0; stats.misses = 0 } })
}
