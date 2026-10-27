import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import assert from 'node:assert/strict'
const url = process.env.CCL_TEST_SUPABASE_URL ?? ''
assert.ok(!url || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url), 'Test server refuses non-local APIs')
const server = await createServer({ root: process.cwd(), configFile: false, envDir: false, plugins: [react()],
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.CCL_TEST_SUPABASE_KEY ?? '') },
  server: { host: '127.0.0.1', port: Number(process.argv[2] ?? 5180), strictPort: true } })
await server.listen()
console.log(`Isolated test app: http://127.0.0.1:${server.config.server.port}`)
