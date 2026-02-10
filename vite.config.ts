import { defineConfig } from 'vite'
import chatHandler from './api/llm/chat'
import modelsHandler from './api/llm/models'

export default defineConfig({
  server: {
    host: '0.0.0.0', // 监听所有网卡，让局域网设备能访问
    port: 5173,
  },
  plugins: [
    {
      name: 'littlephone-local-api',
      configureServer(server) {
        // 本地开发：让 Vite dev server 直接承载 /api/llm/*（避免必须 vercel dev）
        server.middlewares.use('/api/llm/chat', (req, res, next) => {
          Promise.resolve((chatHandler as any)(req, res)).catch(next)
        })
        server.middlewares.use('/api/llm/models', (req, res, next) => {
          Promise.resolve((modelsHandler as any)(req, res)).catch(next)
        })
      },
    },
  ],
  define: {
    // 构建时间戳，用于前端版本检测
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
})
