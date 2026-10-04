<template>
  <view class="page">
    <view class="title">实验室万物互联</view>
    <input class="input" v-model="baseUrl" placeholder="中枢地址 http://192.168.x.x:3000" />
    <input class="input" v-model="password" placeholder="密码" password />
    <button class="btn" :loading="loading" @click="login">进入生态</button>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { request, setBase, setToken, getBase } from '../../utils/request.js'

const baseUrl = ref(getBase() || 'http://127.0.0.1:3000')
const password = ref('')
const loading = ref(false)

async function login() {
  if (loading.value) return // 防双击重复提交
  if (!baseUrl.value || !password.value) return uni.showToast({ title: '地址和密码都要填', icon: 'none' })
  loading.value = true
  try {
    setBase(baseUrl.value)
    const { token } = await request('POST', '/api/login', { password: password.value })
    setToken(token)
    uni.reLaunch({ url: '/pages/devices/devices' })
  } catch (e) {
    uni.showToast({ title: e.message, icon: 'none' })
  } finally {
    loading.value = false
  }
}
</script>

<style>
.page { padding: 120rpx 60rpx; }
.title { font-size: 44rpx; font-weight: bold; text-align: center; margin-bottom: 80rpx; }
.input { border: 1rpx solid #d1d5db; border-radius: 12rpx; padding: 20rpx; margin-bottom: 30rpx; }
.btn { background: #1f2937; color: #fff; margin-top: 40rpx; }
</style>
