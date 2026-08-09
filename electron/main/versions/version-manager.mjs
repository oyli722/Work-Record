// 版本历史数据层（阶段 5，PRD §4.5 / docs/阶段5-version-设计文档.md）
// 工厂函数 createVersionManager(fsOps, options)：依赖注入 fs-ops（受控 + pathGuard），
// 不在 IPC 直接触碰 fs（PRD §7.1）。options 可覆盖保留策略阈值（单测用小值验证精简）。
//
// 存储：`.wr/versions/<文档相对路径>/V{n}.md`（完整内容快照，编号递增不重排）
//   + `meta.json`（唯一真相，评审 O2：无冗余 fileName）。
// 保留策略（确定性，PRD §4.5.3）：最近 N 版全量 + 更早每 M 版留 1 里程碑（versionId % M === 1）
//   + 总数 > 阈值才精简（评审 P1：total = 现存快照数）。精简幂等（评审 S2：先更 meta 再删快照）。

import { WR_DIR_NAME } from '../storage/constants.mjs'

const VERSIONS_DIR = 'versions'
const DEFAULT_KEEP_RECENT = 10
const DEFAULT_MILESTONE_EVERY = 10
const DEFAULT_PRUNE_THRESHOLD = 50

export function createVersionManager(fsOps, options = {}) {
  const keepRecent = options.keepRecent ?? DEFAULT_KEEP_RECENT
  const milestoneEvery = options.milestoneEvery ?? DEFAULT_MILESTONE_EVERY
  const pruneThreshold = options.pruneThreshold ?? DEFAULT_PRUNE_THRESHOLD

  const metaPath = (relPath) => `${WR_DIR_NAME}/${VERSIONS_DIR}/${relPath}/meta.json`
  const snapPath = (relPath, versionId) =>
    `${WR_DIR_NAME}/${VERSIONS_DIR}/${relPath}/V${versionId}.md`

  /** 读取 meta（不存在返回空结构）；解析失败视为无版本 */
  async function readMeta(relPath) {
    try {
      const raw = await fsOps.readFile(metaPath(relPath))
      return JSON.parse(raw)
    } catch {
      return { versions: [] }
    }
  }

  async function writeMeta(relPath, meta) {
    await fsOps.writeFile(metaPath(relPath), JSON.stringify(meta, null, 2))
  }

  /** 记录新版本：写快照 + 更新 meta + 保留策略精简。返回新版本号。 */
  async function recordVersion(relPath, content, editedBy) {
    const meta = await readMeta(relPath)
    const nextId = meta.versions.length
      ? Math.max(...meta.versions.map((v) => v.versionId)) + 1
      : 1
    await fsOps.writeFile(snapPath(relPath, nextId), content)
    meta.versions.push({ versionId: nextId, editedBy, ts: Date.now() })

    // 保留策略：最近 keepRecent 版全量 + 里程碑（versionId % milestoneEvery === 1）；
    // 总数 <= 阈值时全保留（评审 P1：total = 现存快照数，非累计记版）
    const total = meta.versions.length
    const recentIds = new Set(
      [...meta.versions]
        .sort((a, b) => b.versionId - a.versionId)
        .slice(0, keepRecent)
        .map((v) => v.versionId)
    )
    const keep = (v) =>
      recentIds.has(v.versionId) || v.versionId % milestoneEvery === 1 || total <= pruneThreshold
    const pruned = meta.versions.filter((v) => !keep(v))
    meta.versions = meta.versions.filter(keep)

    // 先写 meta（真相），再删快照（幂等：删文件失败不阻断，下次精简重试，评审 S2）
    await writeMeta(relPath, meta)
    for (const v of pruned) {
      try {
        await fsOps.delete(snapPath(relPath, v.versionId))
      } catch {
        /* 幂等：下次精简重试 */
      }
    }
    return { ok: true, versionId: nextId }
  }

  /** 版本元数据列表（按 versionId 降序） */
  async function listVersions(relPath) {
    const meta = await readMeta(relPath)
    return { versions: meta.versions.slice().sort((a, b) => b.versionId - a.versionId) }
  }

  /** 读取指定版本完整内容（供对比 / 回滚 / 导出） */
  async function readVersion(relPath, versionId) {
    const content = await fsOps.readFile(snapPath(relPath, versionId))
    return { content }
  }

  return { recordVersion, listVersions, readVersion }
}
