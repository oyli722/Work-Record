import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createPathGuard } from '../electron/main/storage/path-guard.mjs'
import { createFsOps } from '../electron/main/storage/fs-ops.mjs'

// fs-ops 单测：验证所有 fs 操作经 guard 受控 + 基本功能正确。

let root
let ops

before(async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'mework-fs-'))
  root = join(tmp, 'workspace')
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'a.txt'), 'hello')
  ops = createFsOps(createPathGuard(root))
})

after(async () => {
  await rm(root, { recursive: true, force: true })
})

test('readFile 读取合法文件', async () => {
  assert.equal(await ops.readFile('a.txt'), 'hello')
})

test('readFile 拒绝穿越路径', async () => {
  await assert.rejects(() => ops.readFile('../secret.txt'), /穿越|symlink/)
  await assert.rejects(() => ops.readFile('/etc/passwd'), /绝对路径/)
})

test('writeFile 自动创建父目录并写入', async () => {
  await ops.writeFile('sub/nested/new.md', '内容')
  assert.equal(await readFile(join(root, 'sub', 'nested', 'new.md'), 'utf-8'), '内容')
})

test('writeFile 拒绝穿越写入', async () => {
  await assert.rejects(() => ops.writeFile('../evil.txt', 'x'), /穿越|symlink/)
})

test('listDirectory 列出顶层目录项', async () => {
  const items = await ops.listDirectory('.')
  assert.ok(items.includes('a.txt'))
  assert.ok(items.includes('sub'))
})

test('listDirectory 排除 .wr 衍生目录', async () => {
  await ops.writeFile('.wr/meta.json', '{}')
  const items = await ops.listDirectory('.')
  assert.ok(!items.includes('.wr')) // 衍生目录对目录树隐藏
  assert.ok(items.includes('a.txt')) // 正常项仍可见
})

test('mkdir 创建嵌套目录', async () => {
  await ops.mkdir('x/y/z')
  const stat = await ops.stat('x/y/z')
  assert.equal(stat.isDirectory, true)
})

test('rename 移动文件（自动建父目录）', async () => {
  await ops.writeFile('move-src.txt', 'mv')
  await ops.rename('move-src.txt', 'moved/dest.txt')
  assert.equal(await ops.readFile('moved/dest.txt'), 'mv')
})

test('rename 拒绝把文件移到根外', async () => {
  await ops.writeFile('stay.txt', 's')
  await assert.rejects(() => ops.rename('stay.txt', '../out.txt'), /穿越|symlink/)
})

test('delete 删除文件与递归目录', async () => {
  await ops.writeFile('del-file.txt', 'd')
  await ops.delete('del-file.txt')
  await assert.rejects(() => ops.readFile('del-file.txt'))

  await ops.mkdir('del-dir/sub')
  await ops.delete('del-dir')
  await assert.rejects(() => ops.stat('del-dir'), /ENOENT/)
})

test('stat 报告存在性与类型', async () => {
  assert.equal((await ops.stat('a.txt')).isFile, true)
  assert.equal((await ops.stat('sub')).isDirectory, true)
  await assert.rejects(() => ops.stat('nope.txt'), /ENOENT/)
})
