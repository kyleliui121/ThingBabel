// 校验并登记设备自我介绍；非法报文记日志丢弃（协议 §3 处理规则）
export function handleDiscovery(db, bus, deviceId, payload) {
  let msg
  try { msg = JSON.parse(payload) } catch { return warn(deviceId, 'JSON 解析失败') }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return warn(deviceId, '载荷不是 JSON 对象') // 'null'/'5'/'[]' 等
  if (typeof msg.proto_ver !== 'number') return warn(deviceId, '缺 proto_ver')
  if (msg.device_id !== deviceId) return warn(deviceId, 'device_id 与主题不一致')
  if (!msg.name || typeof msg.name !== 'string') return warn(deviceId, '缺 name')
  if (!msg.type || typeof msg.type !== 'string') return warn(deviceId, '缺 type')
  for (const k of ['properties', 'actions', 'events'])
    if (!Array.isArray(msg[k])) return warn(deviceId, `${k} 必须是数组`)

  db.upsertDevice({
    device_id: deviceId, name: msg.name, type: msg.type,
    description: msg.description ?? '', proto_ver: msg.proto_ver,
    caps_json: payload
  })
  bus?.emit('push', { type: 'discovery', device_id: deviceId, name: msg.name })
}

function warn(id, reason) {
  console.warn(`[discovery] 丢弃 ${id} 的自我介绍：${reason}`)
}
