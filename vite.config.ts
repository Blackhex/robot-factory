import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin, type ViteDevServer } from 'vite'

/**
 * Watches PXT target sources and rebuilds `public/pxt-editor/` when they
 * change, so the Vite dev server stays in sync with the visual editor.
 */
function pxtWatchPlugin(): Plugin {
  const root = __dirname
  const pxtTargetDir = path.resolve(root, 'pxt-target')
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
  let running: ChildProcess | undefined
  let rerunQueued = false
  let debounceTimer: NodeJS.Timeout | undefined

  const log = (msg: string) => {
    server?.config.logger.info(`[pxt] ${msg}`, { timestamp: true })
  }

  const runBuild = (): Promise<void> =>
    new Promise((resolve) => {
      if (running) {
        rerunQueued = true
        resolve()
        return
      }
      log('rebuilding PXT editor...')
      const start = Date.now()
      running = spawn('npm', ['run', 'build:pxt:dev'], {
        cwd: root,
        stdio: 'inherit',
        shell: true,
      })
      running.on('exit', (code) => {
        running = undefined
        const secs = ((Date.now() - start) / 1000).toFixed(1)
        if (code === 0) {
          log(`PXT editor rebuilt in ${secs}s`)
          server?.ws.send({ type: 'full-reload' })
        } else {
          log(`PXT rebuild failed (exit ${code})`)
        }
        if (rerunQueued) {
          rerunQueued = false
          void runBuild()
        }
        resolve()
      })
    })

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

      const shouldTrigger = (file: string) => {
        const normalized = file.replace(/\\/g, '/')
        // Skip files PXT regenerates during its own build to avoid rebuild loops.
        const basename = path.posix.basename(normalized)
        if (basename === 'enums.d.ts' || basename === 'sims.d.ts') return false
        return (
          normalized.startsWith(pxtTargetDir.replace(/\\/g, '/') + '/') &&
          !normalized.includes('/built/') &&
          !normalized.includes('/node_modules/')
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
        void runBuild()
      }
    },
  }
}

export default defineConfig({
  plugins: [pxtWatchPlugin()],
  server: {
    watch: {
      // Don't trigger HMR/full-reload when PXT writes to its output folder
      // inside public/, otherwise the page reloads in a loop on every build.
      ignored: ['**/public/pxt-editor/**', '**/pxt-target/built/**'],
    },
  },
})
