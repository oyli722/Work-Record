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

test('listDetail 一次返回条目与类型（4.1 目录树聚合）', async () => {
  const items = await ops.listDetail('.')
  const names = items.map((i) => i.name)
  assert.ok(names.includes('a.txt'))
  assert.ok(names.includes('sub'))
  assert.ok(!names.includes('.wr')) // 聚合同样排除衍生目录
  assert.equal(items.find((i) => i.name === 'a.txt').isDirectory, false)
  assert.equal(items.find((i) => i.name === 'sub').isDirectory, true)
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

test('renameWithVersions 重命名并迁移版本库（源存在时，4.3）', async () => {
  await ops.writeFile('mv-note.md', 'x')
  await ops.writeFile('.wr/versions/mv-note.md/V1.md', 'v1') // 模拟阶段 5 版本库
  await ops.renameWithVersions('mv-note.md', 'renamed.md')
  assert.equal(await ops.readFile('renamed.md'), 'x') // 文件已移动
  assert.equal(await ops.readFile('.wr/versions/renamed.md/V1.md'), 'v1') // 版本库已迁移
  await assert.rejects(() => ops.readFile('.wr/versions/mv-note.md/V1.md'), /ENOENT/) // 旧库已移除
})

test('renameWithVersions 版本库不存在时跳过（阶段 4 预留调用）', async () => {
  await ops.writeFile('plain-note.md', 'y')
  await ops.renameWithVersions('plain-note.md', 'plain-renamed.md') // 不应抛错
  assert.equal(await ops.readFile('plain-renamed.md'), 'y')
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
