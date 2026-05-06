// src/entrypoints/server.ts
// Industry Agent Runtime HTTP server entrypoint.
// Does NOT import src/screens, src/components, src/main.tsx, or Ink.
import { createRouter, createServerDeps } from '../server/http/createServer.js'

const PORT = parseInt(process.env.INDUSTRY_RUNTIME_PORT ?? '4000', 10)

const deps = createServerDeps()
const router = createRouter(deps)

const server = Bun.serve({
  port: PORT,
  fetch: router,
})

console.log(`Industry Agent Runtime listening on http://localhost:${server.port}`)
