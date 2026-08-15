// 目录树数据层 hook（OPT-3a：从 Sidebar 拆分）
// 职责：树数据（nodes / open / error / loading）与数据操作（加载 / 展开 / 刷新 / CRUD 落盘）。
// UI 编排留在 Sidebar：右键菜单 / 内联输入 / 弹窗 / 与 editor（打开文件、关闭受影响标签）联动。
// 纯函数部分在 utils/file-tree.js（可单测）；fs 统一注入（window.mework.fs 或测试 mock）。
//
// 返回的数据操作约定：create / rename / delete 返回 { ok, ... }，失败时同时置入 listError；
// 文件打开（createNode 后 openFile、deleteNode 后 closeIfPathDeleted）由调用方（Sidebar）完成。

import { useCallback, useRef, useState } from 'react'
import {
  buildNodes,
  refreshTreeNodes,
  replaceNode,
  uniqueName,
  updateNode
} from '../utils/file-tree'
import { dirOf } from '../utils/path'

export default function useFileTree({ fs }) {
  const [tree, setTree] = useState(null)
  const [listOpen, setListOpen] = useState(false)
  const [listError, setListError] = useState(null)
  const [listLoading, setListLoading] = useState(false)

  // ref 镜像最新值：供刷新类操作在稳定闭包下读到当前树（toggleList / refreshTree）
  const treeRef = useRef(tree)
  treeRef.current = tree
  const listLoadingRef = useRef(listLoading)
  listLoadingRef.current = listLoading

  /** 加载根层节点（首次展开时） */
  const loadRoot = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const items = await fs.listDetail('.')
      setTree(buildNodes(items, ''))
    } catch (err) {
      setListError(String(err?.message ?? err))
    } finally {
      setListLoading(false)
    }
  }, [fs])

  /** 展开/关闭文件夹节点（懒加载子级；关闭时释放子数据保持新鲜；不可变更新） */
  const toggleFolder = useCallback(
    async (node) => {
      if (node.expanded) {
        setTree((t) => updateNode(t, node.relPath, (n) => ({ ...n, expanded: false, children: null })))
        return
      }
      setTree((t) => updateNode(t, node.relPath, (n) => ({ ...n, loading: true })))
      try {
        const items = await fs.listDetail(node.relPath)
        const children = buildNodes(items, node.relPath)
        setTree((t) =>
          updateNode(t, node.relPath, (n) => ({ ...n, expanded: true, loading: false, children, error: null }))
        )
      } catch (err) {
        setTree((t) =>
          updateNode(t, node.relPath, (n) => ({ ...n, loading: false, error: String(err?.message ?? err) }))
        )
      }
    },
    [fs]
  )

  /** 递归展开节点：拉取每层子级并展开所有子文件夹（返回更新后的节点树） */
  const expandNode = useCallback(
    async (node) => {
      const items = await fs.listDetail(node.relPath)
      const children = buildNodes(items, node.relPath)
      const expandedChildren = []
      for (const child of children) {
        expandedChildren.push(
          child.isDir ? await expandNode({ ...child, expanded: true, loading: false }) : child
        )
      }
      return { ...node, expanded: true, loading: false, error: null, children: expandedChildren }
    },
    [fs]
  )

  /** 递归展开/收起整个子树（9.2.3 用户反馈：点击箭头，子文件夹递归展开） */
  const toggleFolderRecursive = useCallback(
    async (node) => {
      if (node.expanded) {
        setTree((t) => updateNode(t, node.relPath, (n) => ({ ...n, expanded: false, children: null })))
        return
      }
      setTree((t) => updateNode(t, node.relPath, (n) => ({ ...n, expanded: true, loading: true })))
      try {
        const expandedNode = await expandNode(node)
        setTree((t) => replaceNode(t, node.relPath, expandedNode))
      } catch (err) {
        setTree((t) =>
          updateNode(t, node.relPath, (n) => ({ ...n, loading: false, error: String(err?.message ?? err) }))
        )
      }
    },
    [expandNode]
  )

  /** 折叠/展开列表（展开且未加载时先加载根层） */
  const toggleList = useCallback(() => {
    const next = !listOpen
    if (next && !tree && !listLoading) loadRoot()
    setListOpen(next)
  }, [listOpen, tree, listLoading, loadRoot])

  /** 刷新目标目录的子树（新建/CRUD 后调用） */
  const refreshParent = useCallback(
    async (parentRelPath) => {
      if (parentRelPath === '') {
        await loadRoot()
        return
      }
      try {
        const items = await fs.listDetail(parentRelPath)
        const children = buildNodes(items, parentRelPath)
        setTree((t) =>
          updateNode(t, parentRelPath, (n) => ({
            ...n,
            children,
            expanded: true,
            loading: false,
            error: null
          }))
        )
      } catch (err) {
        setListError(String(err?.message ?? err))
      }
    },
    [fs, loadRoot]
  )

  /** 刷新整个目录树（保留展开状态，感知外部改动；4.5） */
  const refreshTree = useCallback(async () => {
    if (!treeRef.current) {
      await loadRoot()
      return
    }
    try {
      setTree(await refreshTreeNodes(fs, treeRef.current, ''))
    } catch (err) {
      setListError(String(err?.message ?? err))
    }
  }, [fs, loadRoot])

  /** 刷新指定文件夹子树（4.5 右键「刷新」） */
  const refreshBranch = useCallback(
    async (node) => {
      try {
        const children = await refreshTreeNodes(fs, node.children ?? [], node.relPath)
        setTree((t) =>
          updateNode(t, node.relPath, (n) => ({
            ...n,
            children,
            expanded: true,
            loading: false,
            error: null
          }))
        )
      } catch (err) {
        setListError(String(err?.message ?? err))
      }
    },
    [fs]
  )

  /** 目标文件夹未展开则先展开加载（新建/重命名前置，保证输入行可见） */
  const ensureFolderLoaded = useCallback(
    async (parentRelPath) => {
      if (parentRelPath === '') return // 根级：列表展开由调用方负责
      setTree((t) => updateNode(t, parentRelPath, (n) => ({ ...n, expanded: true, loading: true })))
      try {
        const items = await fs.listDetail(parentRelPath)
        const children = buildNodes(items, parentRelPath)
        setTree((t) =>
          updateNode(t, parentRelPath, (n) => ({ ...n, loading: false, children, error: null }))
        )
      } catch (err) {
        setTree((t) =>
          updateNode(t, parentRelPath, (n) => ({ ...n, loading: false, error: String(err?.message ?? err) }))
        )
      }
    },
    [fs]
  )

  /** 新建节点（文件夹 mkdir / 文件空文件 writeFile）。重名自动序号（uniqueName）；
      成功后刷新父目录。返回 { ok, relPath, name }；失败置 listError 并返回 { ok:false }。
      文件「打开」由调用方在 ok 后执行（新建 MD 自动打开，用户定案）。 */
  const createNode = useCallback(
    async ({ parentRelPath, type, rawName }) => {
      const name = rawName.trim().replace(/[/\\]/g, '-') // 去除路径分隔符，防嵌套
      if (!name) return { ok: false, error: '名称为空' }
      try {
        const finalName = await uniqueName(fs, parentRelPath, name)
        const relPath = parentRelPath ? `${parentRelPath}/${finalName}` : finalName
        if (type === 'folder') {
          await fs.mkdir(relPath)
        } else {
          await fs.writeFile(relPath, '') // 空文件（用户定案）
        }
        await refreshParent(parentRelPath)
        return { ok: true, relPath, name: finalName }
      } catch (err) {
        setListError(String(err?.message ?? err))
        return { ok: false, error: String(err?.message ?? err) }
      }
    },
    [fs, refreshParent]
  )

  /** 重命名节点（文件/文件夹 + 版本库前缀迁移，PRD §4.3.4）。
      目标已存在拒绝（评审 P3：POSIX/macOS 下 rename 会静默覆盖）。成功后刷新父目录。
      返回 { ok, relPath: 新路径 }（原路径不变表示未执行）；打开中文件的同步由调用方（renameCurrentFile）。 */
  const renameNode = useCallback(
    async (node, rawName) => {
      const newName = rawName.trim().replace(/[/\\]/g, '-')
      if (!newName || newName === node.name) return { ok: true, relPath: node.relPath } // 无变化
      const parentRelPath = dirOf(node.relPath)
      const newRelPath = parentRelPath ? `${parentRelPath}/${newName}` : newName
      let targetExists = false
      try {
        targetExists = (await fs.stat(newRelPath)).exists
      } catch {
        targetExists = false // 目标不存在（ENOENT），允许重命名
      }
      if (targetExists) {
        setListError(`已存在同名目标「${newName}」，重命名已取消。`)
        return { ok: false, error: 'target-exists', relPath: node.relPath }
      }
      try {
        await fs.renameWithVersions(node.relPath, newRelPath)
        await refreshParent(parentRelPath)
        return { ok: true, relPath: newRelPath }
      } catch (err) {
        setListError(String(err?.message ?? err))
        return { ok: false, error: String(err?.message ?? err), relPath: node.relPath }
      }
    },
    [fs, refreshParent]
  )

  /** 删除节点（文件/文件夹 + 版本库清空，PRD §4.3.5）。成功后刷新父目录。
      返回 { ok }；打开中文件的关闭由调用方（closeIfPathDeleted）。 */
  const deleteNode = useCallback(
    async (node) => {
      const parentRelPath = dirOf(node.relPath)
      try {
        await fs.deleteWithVersions(node.relPath)
        await refreshParent(parentRelPath)
        return { ok: true }
      } catch (err) {
        setListError(String(err?.message ?? err))
        return { ok: false, error: String(err?.message ?? err) }
      }
    },
    [fs, refreshParent]
  )

  /** 9.2.8 新建文件（先建默认名再改，用户定案）：以默认名建空文件并刷新父目录。
      返回 { ok, relPath, name }；改名弹窗由调用方弹出。 */
  const createFileDefault = useCallback(
    async (parentRelPath) => {
      try {
        const name = await uniqueName(fs, parentRelPath, '未命名.md')
        const relPath = parentRelPath ? `${parentRelPath}/${name}` : name
        await fs.writeFile(relPath, '') // 空文件
        await refreshParent(parentRelPath) // 新文件入树
        return { ok: true, relPath, name }
      } catch (err) {
        setListError(String(err?.message ?? err))
        return { ok: false, error: String(err?.message ?? err) }
      }
    },
    [fs, refreshParent]
  )

  /** 清空并收起目录树（切换工作区后调用，评审 P2：不残留旧工作区数据） */
  const reset = useCallback(() => {
    setTree(null)
    setListError(null)
    setListOpen(false)
    setListLoading(false)
  }, [])

  return {
    tree,
    listOpen,
    listError,
    listLoading,
    setListOpen,
    setListError,
    loadRoot,
    toggleFolder,
    toggleFolderRecursive,
    toggleList,
    refreshTree,
    refreshBranch,
    refreshParent,
    ensureFolderLoaded,
    createNode,
    renameNode,
    deleteNode,
    createFileDefault,
    reset
  }
}
