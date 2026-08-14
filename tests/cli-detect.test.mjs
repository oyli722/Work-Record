import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCliDetect } from '../electron/main/terminal/cli-detect.mjs'

// cli-detect 单测：验证跨平台 claude CLI 探测（CC-2，mock 探测执行器）。
// 不依赖真实 where/which：注入 run（执行器）、exists（文件判定）、home/platform/comSpec。

const HOME = 'C:\\Users\\tester'
const NPM_SHIM = 'C:\\Users\\tester\\AppData\\Roaming\\npm\\claude.cmd'
const COMSPEC = 'C:\\Windows\\System32\\cmd.exe'

/**
 * 可编程探测执行器：
 *   steps 以命令名为键（或 default 兜底）；值为字符串（stdout）、Error（抛错）或函数。
 *   记录每次调用 [cmd, args]。
 */
function createRun(steps) {
  const calls = []
  const run = async (cmd, args) => {
    calls.push([cmd, args])
    const step = steps[cmd] ?? steps.default
    if (step instanceof Error) throw step
    return typeof step === 'function' ? step(cmd, args) : step
  }
  return { run, calls }
}

test('win32 PATH 探测成功：.cmd 经 cmd.exe /c 包装（设计 §7 风险表）', async () => {
  const { run, calls } = createRun({
    where: 'C:\\npm\\claude.cmd',
    default: '1.2.3' // --version 输出
  })
  const cli = createCliDetect({ run, exists: () => false, home: HOME, platform: 'win32', comSpec: COMSPEC })

  const result = await cli.detect()

  assert.equal(result.installed, true)
  assert.equal(result.path, 'C:\\npm\\claude.cmd')
  assert.equal(result.command, COMSPEC)
  assert.deepEqual(result.args, ['/c', 'C:\\npm\\claude.cmd'])
  assert.equal(result.version, '1.2.3')
  // where 先探测；随后 --version 经包装命令执行
  assert.deepEqual(calls[0], ['where', ['claude']])
  assert.deepEqual(calls[1], [COMSPEC, ['/c', 'C:\\npm\\claude.cmd', '--version']])
})

test('where 输出多行时取首个非空行', async () => {
  const { run } = createRun({ where: '\r\nC:\\npm\\claude.cmd\r\n' })
  const cli = createCliDetect({ run, exists: () => false, home: HOME, platform: 'win32', comSpec: COMSPEC })

  const result = await cli.detect()

  assert.equal(result.path, 'C:\\npm\\claude.cmd')
})

test('PATH 探测失败 → 常见安装位置兜底（npm shim）', async () => {
  const { run } = createRun({ where: new Error('not found'), default: '0.5.0' })
  const exists = (p) => p === NPM_SHIM
  const cli = createCliDetect({ run, exists, home: HOME, platform: 'win32', comSpec: COMSPEC })

  const result = await cli.detect()

  assert.equal(result.installed, true)
  assert.equal(result.path, NPM_SHIM)
  assert.deepEqual(result.args, ['/c', NPM_SHIM])
})

test('PATH 与常见位置均未找到 → installed:false（右键菜单置灰依据）', async () => {
  const { run, calls } = createRun({ where: new Error('not found') })
  const cli = createCliDetect({ run, exists: () => false, home: HOME, platform: 'win32', comSpec: COMSPEC })

  const result = await cli.detect()

  assert.deepEqual(result, { installed: false })
  // 未找到时不执行 --version
  assert.equal(calls.length, 1)
})

test('unix PATH 探测：which 命中直接 spawn 路径（无 .cmd 包装）', async () => {
  const { run } = createRun({ which: '/opt/homebrew/bin/claude', default: '2.0.0' })
  const cli = createCliDetect({ run, exists: () => false, home: '/Users/tester', platform: 'darwin' })

  const result = await cli.detect()

  assert.equal(result.installed, true)
  assert.equal(result.command, '/opt/homebrew/bin/claude')
  assert.deepEqual(result.args, [])
  assert.equal(result.version, '2.0.0')
})

test('版本探测失败 → version:null，不阻塞安装判定', async () => {
  const { run } = createRun({ where: 'C:\\npm\\claude.cmd', default: new Error('--version 失败') })
  const cli = createCliDetect({ run, exists: () => false, home: HOME, platform: 'win32', comSpec: COMSPEC })

  const result = await cli.detect()

  assert.equal(result.installed, true)
  assert.equal(result.version, null)
})

test('结果缓存：重复 detect 不重复探测；invalidate 后重新探测', async () => {
  const { run, calls } = createRun({ where: 'C:\\npm\\claude.cmd', default: '1.0.0' })
  const cli = createCliDetect({ run, exists: () => false, home: HOME, platform: 'win32', comSpec: COMSPEC })

  await cli.detect()
  await cli.detect()
  const cachedCalls = calls.length
  assert.ok(cachedCalls >= 1, '应至少执行一次探测')

  cli.invalidate()
  await cli.detect()
  assert.ok(calls.length > cachedCalls, 'invalidate 后应重新探测')
})
