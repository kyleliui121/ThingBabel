// C1 映射规则（论文实验设计 §3.2）：lab-proto 能力清单 → LLM tool schema，零人工转换。
// "零转换证据"：本文件即全部适配层；新设备接入不产生任何新代码或配置。
const TYPE_MAP = { number: 'number', string: 'string', boolean: 'boolean' } // 白名单外的类型降级 string

// 内置工具：读设备状态（properties 不生成工具，遥测通过它按需查询）+ 读最近事件（anomaly 报警等，"检测→编排"地基）
const STATE_TOOL = {
  type: 'function',
  function: {
    name: 'lab_get_device_state',
    description: '查询一台设备的最新遥测与在线状态',
    parameters: {
      type: 'object',
      properties: { device_id: { type: 'string', description: '设备 id，如 sensor-01' } },
      required: ['device_id']
    }
  }
}
const EVENT_TOOL = {
  type: 'function',
  function: {
    name: 'lab_get_recent_events',
    description: '查询最近的设备事件与异常告警（如 anomaly：某属性偏离滚动均值）',
    parameters: {
      type: 'object',
      properties: {
        device_id: { type: 'string', description: '可选，只看某台设备' },
        limit: { type: 'number', description: '条数，默认 10' }
      },
      required: []
    }
  }
}
const ALWAYS_INCLUDED = new Set(['lab_get_device_state', 'lab_get_recent_events'])

export function capsToTools(caps, deviceId) {
  return (caps.actions || []).map(a => ({
    type: 'function',
    function: {
      // 工具名仅允许 [a-zA-Z0-9_-]，device_id 与 action 名用双下划线拼接
      name: `${deviceId}__${a.name}`,
      description: `[${caps.name || deviceId}] ${a.description || a.name}`,
      parameters: {
        type: 'object',
        properties: Object.fromEntries((a.params || []).map(p => {
          const sch = { type: TYPE_MAP[p.type] || 'string', description: p.name }
          if (p.enum) sch.enum = p.enum
          if (typeof p.min === 'number') sch.minimum = p.min
          if (typeof p.max === 'number') sch.maximum = p.max
          return [p.name, sch]
        })),
        required: (a.params || []).filter(p => p.required).map(p => p.name)
      }
    }
  }))
}

// 注册表快照：全部设备的 tools + system prompt 文本（含当前遥测值）
export function buildRegistry(db) {
  const tools = [STATE_TOOL, EVENT_TOOL]
  const lines = []
  for (const d of db.listDevices()) {
    let caps = {}
    try { caps = JSON.parse(d.caps_json) } catch {}
    tools.push(...capsToTools(caps, d.device_id))
    const props = Object.fromEntries(db.latestProps(d.device_id).map(p => [p.key, p.value]))
    const actionNames = (caps.actions || []).map(a => a.name).join(',') || '无'
    lines.push(`- ${d.device_id}「${d.name}」type=${d.type} ${d.online ? '在线' : '离线'} 最新遥测=${JSON.stringify(props)} 指令=${actionNames}`)
  }
  const prompt = [
    '你是实验室设备编排助手。当前已接入的设备清单：',
    lines.length ? lines.join('\n') : '（暂无设备）',
    '规则：只使用提供的工具查询和操作设备；执行结果以工具返回为准，不要编造；设备离线或指令失败时如实向用户说明。'
  ].join('\n')
  return { tools, prompt }
}

// M5 分组注入（实验设计 §4.2）：确定性工具子集——按任务文本与设备 id/名称/类型的字面匹配筛选，
// 无任何命中则回退全量（任务大概率是全局性的）。纯字符串匹配，不用 embedding（第三轮调研 A1.1 判定该规模为过度设计）
export function selectTools(db, taskText, allTools) {
  const matched = allTools.filter(t => {
    if (ALWAYS_INCLUDED.has(t.function?.name)) return true
    const sep = t.function.name.indexOf('__')
    if (sep < 0) return false
    const d = db.getDevice(t.function.name.slice(0, sep))
    if (!d) return false
    return taskText.includes(d.device_id) || taskText.includes(d.name) || taskText.includes(d.type)
  })
  return matched.length > ALWAYS_INCLUDED.size ? matched : allTools // 只剩内建工具 = 没匹配到任何设备，回退全量
}
