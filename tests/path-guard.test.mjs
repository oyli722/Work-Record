import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createPathGuard } from '../electron/main/storage/path-guard.mjs'

// pathGuard 单测（node --test）
// 覆盖 PRD §3.2.2 三类穿越拒绝 + 合法路径放行 + symlink realpath 逃逸。

let root
let tmp

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'mework-pg-'))
  root = join(tmp, 'workspace')
  await mkdir(join(root, 'sub', 'nested'), { recursive: true })
  await writeFile(join(root, 'a.txt'), 'A')
  await writeFile(join(root, 'sub', 'b.txt'), 'B')
})

after(async () => {
  await rm(tmp, { recursive: true, force: true })
})

test('合法相对路径放行并解析到根内绝对路径', () => {
  const g = createPathGuard(root)
  assert.equal(g.resolvePath('a.txt'), join(root, 'a.txt'))
  assert.equal(g.resolvePath('sub/nested'), join(root, 'sub', 'nested'))
  assert.equal(g.resolvePath('./a.txt'), join(root, 'a.txt'))
})

test('空串是非法输入，被拒绝（防默认落到根路径的越权风险）', () => {
  const g = createPathGuard(root)
  assert.throws(() => g.resolvePath(''), /不能为空/)
  assert.throws(() => g.resolvePath(null), /不能为空/)
  assert.throws(() => g.resolvePath(undefined), /不能为空/)
})

test('绝对路径穿越被拒（正斜杠 / 反斜杠 / Windows 盘符）', () => {
  const g = createPathGuard(root)
  assert.throws(() => g.resolvePath('/etc/passwd'), /绝对路径/)
  assert.throws(() => g.resolvePath('C:\\Windows'), /绝对路径/)
  assert.throws(() => g.resolvePath('C:/Windows'), /绝对路径/)
  assert.throws(() => g.resolvePath(root), /绝对路径/)
})

test('../ 相对穿越被拒', () => {
  const g = createPathGuard(root)
  assert.throws(() => g.resolvePath('../secret'), /穿越/)
  assert.throws(() => g.resolvePath('sub/../../secret'), /穿越/)
  assert.throws(() => g.resolvePath('..'), /穿越/)
  // 多种分隔符写法均应拒绝
  assert.throws(() => g.resolvePath('..\\..\\secret'), /穿越/)
})

test('协议路径被拒（file: / smb: 等）', () => {
  const g = createPathGuard(root)
  assert.throws(() => g.resolvePath('file:///etc/passwd'), /协议路径/)
})

test('assertSafe 对合法路径返回绝对路径（含 symlink 校验）', async () => {
  const g = createPathGuard(root)
  assert.equal(await g.assertSafe('a.txt'), join(root, 'a.txt'))
  assert.equal(await g.assertSafe('sub/b.txt'), join(root, 'sub', 'b.txt'))
})

test('symlink 逃逸被拒（链接指向根外真实目录）', async (t) => {
  // 根外放一个真实目录（含文件）+ 根内建 symlink 指向它
  const outsideDir = join(tmp, 'outside-dir')
  await mkdir(outsideDir, { recursive: true })
  await writeFile(join(outsideDir, 'secret.txt'), 'SECRET')
  const link = join(root, 'sub', 'escape-link')

  try {
    // Windows 下目录 junction 无需提权；目录 symlink 需要权限，测试内降级跳过
    if (process.platform === 'win32') {
      await symlink(outsideDir, link, 'junction')
    } else {
      await symlink(outsideDir, link, 'dir')
    }
  } catch (err) {
    t.skip(`当前环境无法创建 symlink: ${err.message}`)
    return
  }

  const g = createPathGuard(root)
  // 解析本身通过（路径形状在根内），但 realpath 校验应拒绝
  await assert.rejects(() => g.assertSafe('sub/escape-link'), /symlink 逃逸/)
})
