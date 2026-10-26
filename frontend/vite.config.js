import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* `vite preview` routes addresses the way Vercel does (vercel.json): a
   file that exists is served as it is, and otherwise the first rewrite that
   matches decides — a public page to its pre-rendered HTML, everything else
   to the bare app (scripts/prerender.mjs). So the tests, which run against
   preview, see what production serves. Only once prerender has run. */
const vercelRewrites = () => ({
  name: 'vercel-rewrites-in-preview',
  configurePreviewServer(server) {
    const dist = path.resolve(server.config.root, server.config.build.outDir)
    const { rewrites = [] } = JSON.parse(fs.readFileSync(path.resolve(server.config.root, 'vercel.json'), 'utf8'))
    const rules = rewrites.map((r) => ({ re: new RegExp(`^${r.source}$`), to: r.destination }))
    server.middlewares.use((req, _res, next) => {
      if (!fs.existsSync(path.join(dist, 'app.html'))) return next()
      const url = new URL(req.url, 'http://preview')
      const file = path.join(dist, decodeURIComponent(url.pathname))
      if (url.pathname === '/' || (fs.existsSync(file) && fs.statSync(file).isFile())) return next()
      const rule = rules.find((r) => r.re.test(url.pathname))
      if (rule) req.url = rule.to + url.search
      next()
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), vercelRewrites()],
})
