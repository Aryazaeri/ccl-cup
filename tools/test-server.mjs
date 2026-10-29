import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import assert from 'node:assert/strict'
import { countdownDemoData } from './countdown-demo-data.mjs'
const url = process.env.CCL_TEST_SUPABASE_URL ?? ''
assert.ok(!url || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url), 'Test server refuses non-local APIs')
const countdownDemo = { name: 'countdown-demo', configureServer(server) {
  if (process.env.CCL_COUNTDOWN_DEMO !== '1') return
  assert.ok(!url, 'Countdown demo requires offline data')
  server.middlewares.use('/__countdown-demo', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    const data = JSON.stringify(countdownDemoData()).replaceAll('<', '\\u003c')
    res.end(`<!doctype html><title>Open countdown demo</title><script>localStorage.setItem('ccl-cup:data:v8', JSON.stringify(${data}));sessionStorage.removeItem('ccl-cup:public-season:v1');location.replace('/#site/match/900001')</script>`)
  })
} }
const server = await createServer({ root: process.cwd(), configFile: false, envDir: false, plugins: [react(), countdownDemo],
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.CCL_TEST_SUPABASE_KEY ?? '') },
  server: { host: '127.0.0.1', port: Number(process.argv[2] ?? 5180), strictPort: true } })
await server.listen()
console.log(`Isolated test app: http://127.0.0.1:${server.config.server.port}`)
