<template>
  <view class="page" v-if="device">
    <view class="head">
      <text class="name">{{ device.name }}</text>
      <text class="sub">{{ device.device_id }} · {{ device.online ? '在线' : '离线' }}</text>
    </view>

    <view class="section">实时数据</view>
    <view class="card" v-for="p in caps.properties" :key="p.key">
      <text class="label">{{ p.name }}</text>
      <text class="value">{{ props[p.key]?.value ?? '—' }} {{ p.unit }}</text>
      <text class="ts">{{ props[p.key]?.ts || '' }}</text>
    </view>

    <view class="section">指令</view>
    <view class="actions">
      <button v-for="a in caps.actions" :key="a.name" class="btn" @click="doAction(a)">{{ a.description || a.name }}</button>
      <text v-if="!caps.actions?.length" class="muted">该设备没有声明指令</text>
    </view>
  </view>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { request } from '../../utils/request.js'
import { subscribeStream } from '../../utils/sse.js'

const device = ref(null)
const caps = ref({ properties: [], actions: [] })
const props = ref({})
let id = ''
let stream = null
let pollTimer = null

onLoad(async q => {
  if (!q?.id) {
    uni.showToast({ title: '缺少设备 id', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 600)
    return
  }
  id = q.id
  if (await loadDetail()) startLive() // 详情加载失败（如设备已删）不启实时订阅，避免对着空气轮询
})
onUnmounted(stopLive)

async function loadDetail() {
  try {
    device.value = await request('GET', `/api/devices/${id}`)
    caps.value = device.value.caps || { properties: [], actions: [] }
    await loadProps()
    return true
  } catch (e) {
    uni.showToast({ title: e.message, icon: 'none' })
    return false
  }
}

async function loadProps() {
  try {
    const list = await request('GET', `/api/devices/${id}/props`)
    props.value = Object.fromEntries(list.map(p => [p.key, { value: p.value, ts: p.ts }]))
  } catch {}
}

function applyPush(m) {
  if (m.device_id !== id) return
  if (m.type === 'props') props.value = { ...props.value, [m.key]: { value: m.value, ts: m.ts } }
  else if (m.type === 'status' && device.value) device.value.online = m.online
}

function stopLive() {
  stream && stream.close()
  stream = null
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

function startLive() {
  stopLive()
  stream = subscribeStream(applyPush, () => { pollTimer = setInterval(loadProps, 3000) }) // SSE 不可用 → 3 秒轮询兜底
}

async function doAction(a) {
  try {
    const { action_id } = await request('POST', `/api/devices/${id}/actions`, { name: a.name })
    uni.showLoading({ title: '执行中' })
    for (let i = 0; i < 6; i++) {                       // 3 秒内每 500ms 轮询回执
      await new Promise(r => setTimeout(r, 500))
      const st = await request('GET', `/api/actions/${action_id}`)
      if (st.status !== 'pending') {
        uni.hideLoading()
        return uni.showToast({ title: `指令${st.status === 'ok' ? '成功' : '失败：' + (st.message || st.status)}`, icon: 'none' })
      }
    }
    uni.hideLoading()
    uni.showToast({ title: '执行超时', icon: 'none' })
  } catch (e) { uni.hideLoading(); uni.showToast({ title: e.message, icon: 'none' }) }
}
</script>

<style>
.page { padding: 24rpx; }
.head { margin: 20rpx 8rpx 30rpx; }
.name { font-size: 40rpx; font-weight: bold; display: block; }
.sub { font-size: 24rpx; color: #6b7280; }
.section { font-size: 26rpx; color: #6b7280; margin: 24rpx 8rpx 12rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 28rpx; margin-bottom: 20rpx; display: flex; align-items: baseline; }
.label { font-size: 28rpx; color: #374151; width: 180rpx; }
.value { font-size: 44rpx; font-weight: bold; flex: 1; }
.ts { font-size: 20rpx; color: #9ca3af; }
.actions { display: flex; flex-wrap: wrap; gap: 16rpx; }
.btn { background: #1f2937; color: #fff; font-size: 26rpx; margin: 0; }
.muted { color: #9ca3af; font-size: 26rpx; }
</style>
