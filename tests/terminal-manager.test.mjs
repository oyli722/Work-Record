import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTerminalManager } from '../electron/main/terminal/terminal-manager.mjs'

// terminal-manager 单测：验证 pty 会话生命周期管理（CC-2，mock pty 注入）。
// 不依赖真实 node-pty：注入最小 mock（spawn/onData/onExit/write/resize/kill）。

/** 最小 pty mock：记录 spawn 参数，暴露可触发的 onData/onExit 回调 */
function createMockPty() {
  const spawned = []
  return {
    spawned,
    spawn(command, args, opts) {
      const proc = {
        command,
        args,
        opts,
        dataCb: null,
        exitCb: null,
        writes: [],
        resizes: [],
        killed: false,
        onData(cb) {
          this.dataCb = cb
        },
        onExit(cb) {
          this.exitCb = cb
        },
        write(data) {
          this.writes.push(data)
        },
        resize(cols, rows) {
          this.resizes.push([cols, rows])
        },
        kill() {
          this.killed = true
        }
      }
      spawned.push(proc)
      return proc
    }
  }
}

/** 跨平台默认 shell 的期望值（与 manager 内部 defaultShell 一致） */
function expectedDefaultShell() {
  if (process.platform === 'win32') return process.env.ComSpec || 'cmd.exe'
  return process.env.SHELL || 'bash'
}

test('create 返回 termId 并按传入 command/args/尺寸 spawn', () => {
  const mock = createMockPty()
  const manager = createTerminalManager({ pty: mock })

  const termId = manager.create({
    command: 'claude',
    args: ['/c', 'C:\\npm\\claude.cmd'],
    cwd: 'C:\\ws',
    cols: 100,
    rows: 40
  })

  assert.equal(typeof termId, 'string')
  assert.ok(termId.length > 0, 'termId 不应为空')
  assert.equal(mock.spawned.length, 1)
  assert.equal(mock.spawned[0].command, 'claude')
  assert.deepEqual(mock.spawned[0].args, ['/c', 'C:\\npm\\claude.cmd'])
  assert.equal(mock.spawned[0].opts.cwd, 'C:\\ws')
  assert.equal(mock.spawned[0].opts.cols, 100)
  assert.equal(mock.spawned[0].opts.rows, 40)
})

test('create 缺省 command 回退默认 shell', () => {
  const mock = createMockPty()
  const manager = createTerminalManager({ pty: mock })

  manager.create({ cwd: '/w' })

  assert.equal(mock.spawned[0].command, expectedDefaultShell())
  assert.deepEqual(mock.spawned[0].args, [])
})

test('pty onData 输出经 (termId, chunk) 回调转发', () => {
  const mock = createMockPty()
  const manager = createTerminalManager({ pty: mock })
  const got = []

  const termId = manager.create({ onData: (id, chunk) => got.push([id, chunk]) })
  mock.spawned[0].dataCb('hello')

  assert.deepEqual(got, [[termId, 'hello']])
})

test('write / resize 转发到对应 pty 会话', () => {
  const mock = createMockPty()
  const manager = createTerminalManager({ pty: mock })

  const termId = manager.create({})
  manager.write(termId, 'ls -la\r')
  manager.resize(termId, 120, 30)

  assert.deepEqual(mock.spawned[0].writes, ['ls -la\r'])
  assert.deepEqual(mock.spawned[0].resizes, [[120, 30]])
})

test('kill 删除会话并杀进程；对已关闭会话重复 kill 不报错', () => {
  const mock = createMockPty()
  const manager = createTerminalManager({ pty: mock })

  const termId = manager.create({})
  manager.kill(termId)

  assert.equal(mock.spawned[0].killed, true)
  // 会话已删除，后续 write 应静默（?. 防御）
  assert.doesNotThrow(() => manager.write(termId, 'x'))
  assert.doesNotThrow(() => manager.kill(termId))
})

test('pty onExit 清理会话并回调 (termId, code)', () => {
  const mock = createMockPty()
  const manager = createTerminalManager({ pty: mock })
  const got = []

  const termId = manager.create({ onExit: (id, code) => got.push([id, code]) })
  mock.spawned[0].exitCb({ exitCode: 3 })

  assert.deepEqual(got, [[termId, 3]])
  // 退出后 write 静默（会话已清理）
  assert.doesNotThrow(() => manager.write(termId, 'x'))
})

test('killAll 关闭全部会话（应用退出 / 工作区切换，CC-7 接入点）', () => {
  const mock = createMockPty()
  const manager = createTerminalManager({ pty: mock })

  manager.create({})
  manager.create({})
  manager.killAll()

  assert.equal(mock.spawned.length, 2)
  assert.ok(mock.spawned.every((p) => p.killed))
})
