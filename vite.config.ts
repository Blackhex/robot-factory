import { spawn } from 'node:child_process'
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin, type ViteDevServer } from 'vite'

const STATIC_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.manifest': 'text/cache-manifest',
  '.webmanifest': 'application/manifest+json',
  '.cur': 'application/octet-stream',
}

/**
 * Watches PXT target sources and rebuilds `public/pxt-editor/` when they
 * change, so the Vite dev server stays in sync with the visual editor.
 */
function pxtWatchPlugin(): Plugin {
  const root = __dirname
  const pxtTargetDir = path.resolve(root, 'pxt-target')
  const pxtNodeModulesMarker = path.resolve(
    pxtTargetDir,
    'node_modules',
    'pxt-core',
    'built',
    'pxt.js',
  )
  const outputDir = path.resolve(root, 'public', 'pxt-editor')

  // Source globs that should trigger a PXT rebuild.
  const watchGlobs = [
    'pxt-target/pxtarget.json',
    'pxt-target/targetconfig.json',
    'pxt-target/package.json',
    'pxt-target/libs/**/*.ts',
    'pxt-target/libs/**/*.json',
    'pxt-target/libs/**/_locales/**',
    'pxt-target/sim/**/*.ts',
    'pxt-target/sim/**/*.html',
    'pxt-target/sim/**/*.json',
  ].map((g) => path.posix.join(root.replace(/\\/g, '/'), g))

  let server: ViteDevServer | undefined
  let busy = false
  let rerunQueued = false
  let debounceTimer: NodeJS.Timeout | undefined
  // Resolved once the initial PXT build has finished (or immediately if the
  // editor output already existed when the dev server started). HTTP requests
  // for the host page block on this so the browser doesn't load the iframe
  // before /pxt-editor/index.html exists and falls back to the textarea.
  let initialBuildDone: Promise<void> = Promise.resolve()

  const log = (msg: string) => {
    server?.config.logger.info(`[pxt] ${msg}`, { timestamp: true })
  }

  const runNpmScript = (script: string, label: string): Promise<number> =>
    new Promise((resolve) => {
      const start = Date.now()
      log(`${label}...`)
      const child = spawn('npm', ['run', script], {
        cwd: root,
        stdio: 'inherit',
        shell: true,
      })
      child.on('exit', (code) => {
        const secs = ((Date.now() - start) / 1000).toFixed(1)
        if (code === 0) {
          log(`${label} done in ${secs}s`)
        } else {
          log(`${label} failed (exit ${code})`)
        }
        resolve(code ?? 1)
      })
    })

  const ensurePxtToolchain = async (): Promise<boolean> => {
    if (existsSync(pxtNodeModulesMarker)) return true
    log('pxt-target/node_modules missing, installing PXT toolchain')
    const code = await runNpmScript('build:pxt:install', 'installing PXT toolchain')
    return code === 0 && existsSync(pxtNodeModulesMarker)
  }

  const runBuild = async (): Promise<void> => {
    if (busy) {
      rerunQueued = true
      return
    }
    busy = true
    try {
      const ready = await ensurePxtToolchain()
      if (!ready) return
      const code = await runNpmScript('build:pxt:dev', 'rebuilding PXT editor')
      if (code === 0) {
        server?.ws.send({ type: 'full-reload' })
      }
    } finally {
      busy = false
      if (rerunQueued) {
        rerunQueued = false
        void runBuild()
      }
    }
  }

  const scheduleBuild = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined
      void runBuild()
    }, 300)
  }

  return {
    name: 'pxt-watch',
    apply: 'serve',
    configureServer(_server) {
      server = _server
      server.watcher.add(watchGlobs)

      // Serve `/pxt-editor/*` requests directly from `public/pxt-editor/` on
      // disk, bypassing Vite's HTML transform and SPA history fallback (both
      // of which would otherwise rewrite `/pxt-editor/index.html` to the host
      // page's HTML and break the iframe).
      //
      // Also blocks the request until the initial PXT build is done, so a
      // browser opened immediately after `npm run dev` waits for the build
      // before loading the iframe instead of falling back to the textarea.
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? ''
        if (!rawUrl.startsWith('/pxt-editor/') && rawUrl !== '/pxt-editor') {
          // Also gate the host page on the initial build so the iframe never
          // loads before its target exists.
          if (rawUrl === '/' || rawUrl.startsWith('/?')) {
            await initialBuildDone
          }
          return next()
        }
        await initialBuildDone

        // Strip query string / hash and decode.
        const cleanPath = decodeURIComponent(rawUrl.split('?')[0].split('#')[0])
        // Map `/pxt-editor/foo` → `<root>/public/pxt-editor/foo`.
        let relative = cleanPath.replace(/^\/pxt-editor\/?/, '') || 'index.html'
        if (relative.endsWith('/')) relative += 'index.html'
        const filePath = path.resolve(outputDir, relative)
        // Defense-in-depth: ensure the resolved path stays inside outputDir.
        if (!filePath.startsWith(outputDir)) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        const ext = path.extname(filePath).toLowerCase()
        const mime = STATIC_MIME[ext] ?? 'application/octet-stream'
        res.setHeader('Content-Type', mime)
        res.setHeader('Cache-Control', 'no-cache')
        createReadStream(filePath).pipe(res)
      })

      const shouldTrigger = (file: string) => {
        const normalized = file.replace(/\\/g, '/')
        // Skip files PXT regenerates during its own build to avoid rebuild loops.
        const basename = path.posix.basename(normalized)
        if (basename === 'enums.d.ts' || basename === 'sims.d.ts') return false
        if (basename === 'package-lock.json') return false
        return (
          normalized.startsWith(pxtTargetDir.replace(/\\/g, '/') + '/') &&
          !normalized.includes('/built/') &&
          !normalized.includes('/node_modules/') &&
          !normalized.includes('/docs/')
        )
      }

      const onChange = (file: string) => {
        if (!shouldTrigger(file)) return
        log(`change detected: ${path.relative(root, file)}`)
        scheduleBuild()
      }

      server.watcher.on('change', onChange)
      server.watcher.on('add', onChange)
      server.watcher.on('unlink', onChange)

      if (!existsSync(outputDir)) {
        log(`output missing at ${path.relative(root, outputDir)}, running initial build`)
        initialBuildDone = runBuild()
      }
    },
  }
}

export default defineConfig(() => ({
  base: process.env.VITE_BASE ?? '/',
  plugins: [pxtWatchPlugin()],
  server: {
    // Listen on all network interfaces so the dev server is reachable from
    // other devices on the LAN (Vite prints both Local and Network URLs).
    host: true,
    watch: {
      // Don't trigger HMR/full-reload when PXT writes to its output folder
      // inside public/, otherwise the page reloads in a loop on every build.
      ignored: ['**/public/pxt-editor/**', '**/pxt-target/built/**'],
    },
  },
}))
