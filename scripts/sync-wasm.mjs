import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const projectRoot = resolve(__dirname, '..')

const entries = [
  {
    source: resolve(
      projectRoot,
      'poll_contract',
      'target',
      'wasm32v1-none',
      'release',
      'poll_contract.wasm',
    ),
    destination: resolve(projectRoot, 'public', 'contracts', 'poll_contract.wasm'),
  },
  {
    source: resolve(
      projectRoot,
      'token_contract',
      'target',
      'wasm32v1-none',
      'release',
      'reward_token_contract.wasm',
    ),
    destination: resolve(projectRoot, 'public', 'contracts', 'reward_token_contract.wasm'),
  },
]

for (const { source, destination } of entries) {
  await mkdir(dirname(destination), { recursive: true })
  await copyFile(source, destination)
  process.stdout.write(`Synced contract wasm to ${destination}\n`)
}
