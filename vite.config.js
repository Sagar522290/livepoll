import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdirSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

function getViteCacheDir() {
  if (process.platform !== 'win32') {
    return undefined
  }

  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) {
    return undefined
  }

  // OneDrive/AV tools can touch files inside the workspace and trigger repeated
  // dependency re-optimizations + full reloads. Keeping the optimizer cache out
  // of the repo makes dev HMR far more stable on Windows.
  const cacheDir = resolve(localAppData, 'live-poll', 'vite-cache')

  try {
    mkdirSync(cacheDir, { recursive: true })
    return cacheDir
  } catch {
    // Some environments (CI/sandboxes) forbid writes outside the workspace.
    // Fall back to Vite's default cache location in those cases.
    return undefined
  }
}

// https://vite.dev/config/
export default defineConfig({
  // On Windows (and some sandboxed environments) `process.cwd()` can be a
  // virtual/symlinked path while Vite/Rolldown resolves HTML entry files to
  // their real paths. That mismatch can cause the build-html plugin to emit an
  // invalid relative fileName for `index.html`. Using the real path keeps paths
  // consistent and avoids build failures.
  root: realpathSync(process.cwd()),
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  cacheDir: getViteCacheDir(),
  server: {
    watch: {
      // Helps avoid rapid-fire change events from OneDrive/AV "atomic write"
      // behavior that can otherwise trigger repeated full page reloads.
      awaitWriteFinish: {
        stabilityThreshold: 250,
        pollInterval: 50,
      },
      ignored: [
        '**/.git/**',
        '**/dist/**',
        '**/deployments/**',
        '**/node_modules/.vite/**',
        '**/node_modules/.cache/**',
        '**/.vercel/**',
        '**/.netlify/**',
        '**/.DS_Store',
        '**/Thumbs.db',
        '**/*.swp',
        '**/*.tmp',
        '**/*.log',
        '**/~*',
      ],
    },
  },
})
