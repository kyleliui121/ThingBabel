// SSE 实时订阅：连不上或断开时回调 onDown，页面据此回退轮询（优化报告 #5）
import { getBase } from './request.js'

export function subscribeStream(onMessage, onDown) {
  if (typeof EventSource === 'undefined') { onDown && onDown(); return { close() {} } }
  const token = uni.getStorageSync('token') || ''
  const es = new EventSource(`${getBase()}/api/stream?token=${encodeURIComponent(token)}`)
  es.onmessage = e => { try { onMessage(JSON.parse(e.data)) } catch {} }
  es.onerror = () => { es.close(); onDown && onDown() } // 不自动重连，交回轮询兜底
  return { close: () => es.close() }
}
