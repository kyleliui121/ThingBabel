// 回执：解析 {action_id,status,message}（协议 §5）；非法载荷忽略
export function handleResult(actions, deviceId, name, payload) {
  let msg
  try { msg = JSON.parse(payload) } catch { return }
  if (!msg || !msg.action_id || !msg.status) return
  const message = typeof msg.message === 'string' ? msg.message : ''
  actions.onResult(msg.action_id, msg.status, message)
}
