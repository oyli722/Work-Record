import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createPathGuard } from '../electron/main/storage/path-guard.mjs'
import { createFsOps } from '../electron/main/storage/fs-ops.mjs'
import { rotateLogs, MAX_LOG_BYTES, MAX_LOG_FILES } from '../electron/main/storage/logger.mjs'

// 9.3.4 日志轮转单测：rotateLogs 注入 fs-ops 实例，验证超限轮转 / 未超限不转 / 备份份数上限。

let root
let ops

before(async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'mework-log-'))
  root = join(tmp, 'workspace')
  await mkdir(root, { recursive: true })
  ops = createFsOps(createPathGuard(root))
})

after(async () => {
  await rm(root, { recursive: true, force: true })
})

test('rotateLogs 未超限不轮转', async () => {
  await ops.writeFile('.wr/logs/app.log', 'small')
  assert.equal(await rotateLogs(ops), false)
  assert.equal(await ops.readFile('.wr/logs/app.log'), 'small')
})

test('rotateLogs 超限轮转：删最旧、逐级移位、app.log→.1', async () => {
  await ops.writeFile('.wr/logs/app.log', 'x'.repeat(MAX_LOG_BYTES + 1))
  await ops.writeFile('.wr/logs/app.log.1', 'backup1')
  await ops.writeFile('.wr/logs/app.log.2', 'backup2')
  assert.equal(await rotateLogs(ops), true)
  // app.log 已轮转 → 新 app.log 暂不存在（下次 append 自动重建）
  await assert.rejects(() => ops.readFile('.wr/logs/app.log'), /ENOENT/)
  // 移位后：.1=旧 app.log，.2=旧 .1，.3=旧 .2
  assert.equal(await ops.readFile('.wr/logs/app.log.1'), 'x'.repeat(MAX_LOG_BYTES + 1))
  assert.equal(await ops.readFile('.wr/logs/app.log.2'), 'backup1')
  assert.equal(await ops.readFile('.wr/logs/app.log.3'), 'backup2')
})

test('rotateLogs 保留份数上限：最多 maxFiles-1 个备份', async () => {
  await ops.writeFile('.wr/logs/app.log', 'z'.repeat(MAX_LOG_BYTES + 1))
  for (let i = 1; i <= MAX_LOG_FILES - 1; i++) {
    await ops.writeFile(`.wr/logs/app.log.${i}`, `old-${i}`)
  }
  await rotateLogs(ops)
  // 移位后：.1=旧 app.log，.2=old-1，.3=old-2，.4=old-3；不产生 .maxFiles 备份
  for (let i = 1; i <= MAX_LOG_FILES - 1; i++) {
    const expected = i === 1 ? 'z'.repeat(MAX_LOG_BYTES + 1) : `old-${i - 1}`
    assert.equal(await ops.readFile(`.wr/logs/app.log.${i}`), expected)
  }
  await assert.rejects(() => ops.readFile(`.wr/logs/app.log.${MAX_LOG_FILES}`), /ENOENT/)
})
