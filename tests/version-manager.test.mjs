import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createPathGuard } from '../electron/main/storage/path-guard.mjs'
import { createFsOps } from '../electron/main/storage/fs-ops.mjs'
import { createVersionManager } from '../electron/main/versions/version-manager.mjs'

// version-manager 单测：快照写入 / meta 真相 / 保留策略精简（确定性规则）。
// 用小阈值验证：keepRecent=2, milestoneEvery=3, pruneThreshold=5。

let root
let ops
let vm

before(async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'mework-ver-'))
  root = join(tmp, 'workspace')
  await mkdir(root, { recursive: true }) // pathGuard 依赖 root 真实存在做 realpath 边界
  ops = createFsOps(createPathGuard(root))
  vm = createVersionManager(ops, { keepRecent: 2, milestoneEvery: 3, pruneThreshold: 5 })
})

after(async () => {
  await rm(root, { recursive: true, force: true })
})

test('recordVersion 首次记 V1，随后递增；list 降序', async () => {
  await vm.recordVersion('a.md', 'v1', 'save')
  await vm.recordVersion('a.md', 'v2', 'auto')
  const list = await vm.listVersions('a.md')
  assert.equal(list.versions.length, 2)
  assert.equal(list.versions[0].versionId, 2) // 降序
  assert.equal(list.versions[0].editedBy, 'auto')
  assert.equal(list.versions[1].editedBy, 'save')
})

test('readVersion 返回对应版本内容', async () => {
  const r = await vm.readVersion('a.md', 1)
  assert.equal(r.content, 'v1')
})

test('保留策略：超过阈值精简（最近 N + 里程碑保留，编号不重排）', async () => {
  // 已记 V1,V2；再记 3..6（total=6 > 5 触发精简）。
  // 最近 2 = V5,V6；里程碑 %3===1 = V1,V4；保留 [1,4,5,6]，V2,V3 被精简。
  for (let i = 3; i <= 6; i++) await vm.recordVersion('a.md', `v${i}`, 'save')
  const list = await vm.listVersions('a.md')
  const ids = list.versions.map((v) => v.versionId).sort((a, b) => a - b)
  assert.deepEqual(ids, [1, 4, 5, 6])

  // 编号不重排：下次记版 id = 7（不是 4）
  const r = await vm.recordVersion('a.md', 'v7', 'save')
  assert.equal(r.versionId, 7)
  // 精简后 meta 仍是唯一真相（可读）
  const after = await vm.listVersions('a.md')
  assert.ok(after.versions.some((v) => v.versionId === 7))
})

test('精简幂等：记录不抛错且 meta 一致', async () => {
  // 连续再记几版触发多次精简，不抛错
  for (let i = 8; i <= 12; i++) await vm.recordVersion('a.md', `v${i}`, 'auto')
  const list = await vm.listVersions('a.md')
  const ids = list.versions.map((v) => v.versionId)
  assert.ok(ids.length > 0)
  // 里程碑 V4 应保留（%3===1）；最近 2 版保留
  assert.ok(ids.includes(4))
})

test('无 meta 的文档 listVersions 返回空', async () => {
  const list = await vm.listVersions('nope.md')
  assert.deepEqual(list.versions, [])
})
