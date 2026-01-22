import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0', // 监听所有网卡，让局域网设备能访问
    port: 5173,
  },
})
