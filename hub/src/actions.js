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
    // 回执不变量（评审第三轮④）：accept(result) ⟺ action_id 存在 ∧ device_id 匹配 ∧ action_name 匹配
    // ∧ status ∈ 枚举（handler 层校验）∧ 指令仍为 pending。任一不满足 → 不改库、不广播
    onResult(actionId, status, message = '', deviceId = null, actionName = null) {
      const a = db.getAction(actionId)
      if (!a) return false // 未知 action_id：忽略（可能是重放或伪造）
      if (deviceId && a.device_id !== deviceId) return false // 回执只能来自其指令所属的设备
      if (actionName && a.action_name !== actionName) return false // 回执只能挂在同一动作的 result 主题上
      const changes = db.updateAction(actionId, { status, message })
      if (!changes) return false // 已终态（迟到回执）：不改库、不广播
      const t = timers.get(actionId)
      if (t) { clearTimeout(t); timers.delete(actionId) }
      return true // 返回值决定是否广播 SSE——拒收的消息不得让展示层"假成功"
    }
  }
}

// 预留给测试的内部钩子（当前测试仅引用以完成模块链接）
export const __test = {}
