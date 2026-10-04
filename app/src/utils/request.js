// 统一请求：baseUrl + token 自动携带；401 清 token 回登录页
export function request(method, path, data) {
  const base = uni.getStorageSync('baseUrl') || ''
  return new Promise((resolve, reject) => {
    uni.request({
      url: base + path,
      method,
      data,
      header: { Authorization: `Bearer ${uni.getStorageSync('token') || ''}` },
      success: res => {
        if (res.statusCode === 401) {
          uni.removeStorageSync('token')
          uni.reLaunch({ url: '/pages/login/login' })
          return reject(new Error('未登录'))
        }
        const body = res.data || {}
        if (body.code !== 0) return reject(new Error(body.message || '请求失败'))
        resolve(body.data)
      },
      fail: () => reject(new Error('无法连接服务器，请检查地址与网络'))
    })
  })
}

export const setBase = url => uni.setStorageSync('baseUrl', url.replace(/\/+$/, ''))
export const setToken = t => uni.setStorageSync('token', t)
export const getBase = () => uni.getStorageSync('baseUrl') || ''
