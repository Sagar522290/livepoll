import { Buffer } from 'buffer'

if (!globalThis.global) {
  globalThis.global = globalThis
}

if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer
}

if (!globalThis.process) {
  globalThis.process = { env: {} }
}

if (!globalThis.litIssuedWarnings) {
  globalThis.litIssuedWarnings = new Set(['dev-mode'])
}
