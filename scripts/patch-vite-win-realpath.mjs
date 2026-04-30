import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

if (process.platform !== 'win32') {
  process.exit(0)
}

const viteChunkPath = resolve(
  process.cwd(),
  'node_modules',
  'vite',
  'dist',
  'node',
  'chunks',
  'node.js',
)

let source
try {
  source = await readFile(viteChunkPath, 'utf8')
} catch {
  // Vite not installed yet.
  process.exit(0)
}

if (source.includes('Ignore restricted shells where spawning "net use" is blocked.')) {
  process.exit(0)
}

const newline = source.includes('\r\n') ? '\r\n' : '\n'
const functionStartNeedle = 'function optimizeSafeRealPathSync() {'
const functionEndNeedle = 'function ensureWatchedFile'

const startIndex = source.indexOf(functionStartNeedle)
if (startIndex === -1) {
  process.exit(0)
}

const endIndex = source.indexOf(functionEndNeedle, startIndex)
if (endIndex === -1) {
  process.exit(0)
}

const replacement = [
  'function optimizeSafeRealPathSync() {',
  '\ttry {',
  '\t\tfs.realpathSync.native(path.resolve("./"));',
  '\t} catch (error) {',
  '\t\tif (error.message.includes("EISDIR: illegal operation on a directory")) {',
  '\t\t\tsafeRealpathSync = fs.realpathSync;',
  '\t\t\treturn;',
  '\t\t}',
  '\t}',
  '\ttry {',
  '\t\texec("net use", (error, stdout) => {',
  '\t\t\tif (error) return;',
  '\t\t\tconst lines = stdout.split("\\n");',
  '\t\t\tfor (const line of lines) {',
  '\t\t\t\tconst m = parseNetUseRE.exec(line);',
  '\t\t\t\tif (m) windowsNetworkMap.set(m[2], m[1]);',
  '\t\t\t}',
  '\t\t\tif (windowsNetworkMap.size === 0) safeRealpathSync = fs.realpathSync.native;',
  '\t\t\telse safeRealpathSync = windowsMappedRealpathSync;',
  '\t\t});',
  '\t} catch {',
  '\t\t// Ignore restricted shells where spawning "net use" is blocked.',
  '\t}',
  '}',
  '',
].join(newline)

const before = source.slice(0, startIndex)
const after = source.slice(endIndex)
const patched = `${before}${replacement}${after}`

if (patched === source) {
  process.exit(0)
}

await writeFile(viteChunkPath, patched, 'utf8')
process.stdout.write('Patched Vite Windows safeRealpath to ignore blocked `net use` exec.\n')
