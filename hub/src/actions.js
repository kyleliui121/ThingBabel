import { randomUUID } from 'node:crypto'

// 指令服务：生成 action_id → 发 MQTT → 等回执，超时置 timeout（协议 §5）
export function createActions({ publish, db, timeoutMs = 5000 }) {
  const timers = new Map()
  return {
    dispatch(deviceId, name, params = {}) {
      const action_id = randomUUID().replace(/-/g, '').slice(0, 12)
      db.createAction({
        action_id, device_id: deviceId, action_name: name,
        params_json: JSON.stringify(params)
      })
      publish(`lab/devices/${deviceId}/actions/${name}`, JSON.stringify({ action_id, params }), { qos: 1 })
      timers.set(action_id, setTimeout(() => {
        timers.delete(action_id)
        db.updateAction(action_id, { status: 'timeout', message: `${timeoutMs / 1000}秒内未收到回执` })
      }, timeoutMs))
      return { action_id }
    },
    onResult(actionId, status, message = '', deviceId = null) {
      const a = db.getAction(actionId)
      if (!a) return false // 未知 action_id：忽略（可能是重放或伪造）
      if (deviceId && a.device_id !== deviceId) return false // 回执只能结束其指令所属设备的指令
      const t = timers.get(actionId)
      if (t) { clearTimeout(t); timers.delete(actionId) }
      db.updateAction(actionId, { status, message })
      return true // 返回值决定是否广播 SSE——拒收的消息不得让展示层"假成功"
    }
  }
}

// 预留给测试的内部钩子（当前测试仅引用以完成模块链接）
export const __test = {}
