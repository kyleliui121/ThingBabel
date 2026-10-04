// 回执：解析 {action_id,status,message}（协议 §5）；非法载荷忽略
// 安全边界：status 必须在协议枚举内；回执只能来自其指令所属的设备（device_id 绑定校验）
const VALID_STATUS = new Set(['ok', 'error', 'rejected'])

export function handleResult(actions, bus, deviceId, name, payload) {
  let msg
  try { msg = JSON.parse(payload) } catch { return }
  if (!msg || !msg.action_id || !msg.status) return
  if (!VALID_STATUS.has(msg.status)) return
  const message = typeof msg.message === 'string' ? msg.message : ''
  actions.onResult(msg.action_id, msg.status, message, deviceId)
  bus?.emit('push', { type: 'action', device_id: deviceId, action: name, action_id: msg.action_id, status: msg.status, message })
}
