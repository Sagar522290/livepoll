import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { realpathSync } from 'node:fs'
import process from 'node:process'

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
})
