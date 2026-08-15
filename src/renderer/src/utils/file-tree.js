// 目录树纯函数操作（OPT-3a：从 Sidebar 拆分，可单测）
// 树节点结构：{ name, relPath, isDir, expanded, loading, error, children }（children 为 null 未加载）
// 文件类型过滤统一查格式注册表（src/shared/format-registry.js，V1.1 扩展点）。
// fs 操作（listDetail / stat / mkdir / writeFile / renameWithVersions / deleteWithVersions）
// 由调用方注入（window.mework.fs 或测试 mock），本模块保持纯逻辑。

import { isSupportedFile } from '../../../shared/format-registry.js'

/** 目录在前、文件在后，各按名称排序（zh locale） */
export function sortNodes(nodes) {
  return [...nodes].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, 'zh')
  })
}

/** 将目录项构造成树节点：文件夹全保留、文件只留受支持格式（查格式注册表）；已排序 */
export function buildNodes(items, parentPath) {
  const nodes = []
  for (const item of items) {
    if (!item.isDirectory && !isSupportedFile(item.name)) continue
    nodes.push({
      name: item.name,
      relPath: parentPath ? `${parentPath}/${item.name}` : item.name,
      isDir: item.isDirectory,
      expanded: false,
      loading: false,
      error: null,
      children: null
    })
  }
  return sortNodes(nodes)
}

/** 不可变更新目录树中指定节点（4.1，评审 S2：不再直接 mutate 节点对象） */
export function updateNode(nodes, relPath, updater) {
  return nodes.map((n) => {
    if (n.relPath === relPath) return updater(n)
    if (n.children) return { ...n, children: updateNode(n.children, relPath, updater) }
    return n
  })
}

/** 不可变替换目录树中指定节点（9.2.3 递归展开后整体替换） */
export function replaceNode(nodes, relPath, newNode) {
  return nodes.map((n) => {
    if (n.relPath === relPath) return newNode
    if (n.children) return { ...n, children: replaceNode(n.children, relPath, newNode) }
    return n
  })
}

/** 递归刷新目录树（保留展开状态，感知外部改动；4.5，PRD §4.3.6）。
    磁盘中已删除的节点移除、新增的项追加；已展开的文件夹递归刷新子级。
    fs 注入（listDetail）。 */
export async function refreshTreeNodes(fs, nodes, parentRelPath) {
  const items = await fs.listDetail(parentRelPath || '.') // 根目录用 '.'
  const diskByName = new Map(items.map((i) => [i.name, i]))
  const existing = new Set(nodes.map((n) => n.name))
  const next = []
  for (const node of nodes) {
    const disk = diskByName.get(node.name)
    if (!disk) continue // 磁盘已删除该节点
    if (node.isDir && node.expanded) {
      const children = node.children ? await refreshTreeNodes(fs, node.children, node.relPath) : null
      next.push({ ...node, children, error: null }) // 保留展开
    } else {
      next.push({ ...node, isDir: disk.isDirectory })
    }
  }
  for (const item of items) {
    if (existing.has(item.name)) continue
    if (!item.isDirectory && !isSupportedFile(item.name)) continue
    next.push({
      name: item.name,
      relPath: parentRelPath ? `${parentRelPath}/${item.name}` : item.name,
      isDir: item.isDirectory,
      expanded: false,
      loading: false,
      error: null,
      children: null
    })
  }
  return sortNodes(next)
}

/** 生成不冲突的最终名（同目录重名自动加序号，如「未命名 2.md」）。fs 注入（listDetail）。 */
export async function uniqueName(fs, parentRelPath, name) {
  const items = await fs.listDetail(parentRelPath || '.') // 根目录用 '.'（空路径被 pathGuard 拒绝）
  const existing = new Set(items.map((i) => i.name))
  if (!existing.has(name)) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let i = 2
  while (existing.has(`${stem} ${i}${ext}`)) i += 1
  return `${stem} ${i}${ext}`
}
