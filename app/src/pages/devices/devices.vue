<template>
  <view class="page">
    <view v-for="d in devices" :key="d.device_id" class="card" @click="go(d)">
      <view class="row">
        <view class="dot" :class="d.online ? 'on' : 'off'" />
        <text class="name">{{ d.name }}</text>
        <text class="type">{{ d.type }}</text>
      </view>
      <view class="props">
        <text v-for="(v, k) in d.props" :key="k" class="prop">{{ k }}: {{ v.value }}</text>
        <text v-if="!Object.keys(d.props).length" class="prop muted">暂无数据</text>
      </view>
      <view class="id">{{ d.device_id }} · {{ d.online ? '在线' : '离线' }}</view>
    </view>
    <view v-if="!devices.length" class="empty">还没有设备接入——跑一个 mock 传感器试试</view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { request } from '../../utils/request.js'
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'

const devices = ref([])

async function load() {
  try { devices.value = await request('GET', '/api/devices') }
  catch (e) { uni.showToast({ title: e.message, icon: 'none' }) }
}

function go(d) {
  uni.navigateTo({ url: `/pages/device/device?id=${d.device_id}` })
}

onShow(load)
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh() })
</script>

<style>
.page { padding: 24rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 28rpx; margin-bottom: 24rpx; }
.row { display: flex; align-items: center; }
.dot { width: 18rpx; height: 18rpx; border-radius: 50%; margin-right: 16rpx; }
.on { background: #22c55e; }
.off { background: #9ca3af; }
.name { font-size: 32rpx; font-weight: bold; flex: 1; }
.type { font-size: 24rpx; color: #6b7280; background: #f3f4f6; padding: 4rpx 16rpx; border-radius: 8rpx; }
.props { display: flex; flex-wrap: wrap; margin-top: 16rpx; }
.prop { font-size: 26rpx; color: #374151; margin-right: 32rpx; }
.muted { color: #9ca3af; }
.id { font-size: 22rpx; color: #9ca3af; margin-top: 12rpx; }
.empty { text-align: center; color: #9ca3af; margin-top: 200rpx; }
</style>
