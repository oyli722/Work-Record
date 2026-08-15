import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildNodes, updateNode, replaceNode, sortNodes, refreshTreeNodes, uniqueName } from '../src/renderer/src/utils/file-tree.js'

// 目录树纯函数（utils/file-tree.js）：OPT-3a 渲染进程补测
// fs 以 mock 注入（listDetail）。

/** 内存目录 mock：path -> [{ name, isDirectory }] */
function mockFs(dirMap) {
  return {
    async listDetail(relPath) {
      const entries = dirMap[relPath || '.']
      if (!entries) throw new Error(`ENOENT: ${relPath}`)
      return entries
    }
  }
}

test('sortNodes：目录在前、文件在后，各按名称排序', () => {
  const nodes = [
    { name: 'b.md', isDir: false },
    { name: 'a', isDir: true },
    { name: 'A.md', isDir: false }
  ]
  const sorted = sortNodes(nodes)
  assert.deepEqual(
    sorted.map((n) => n.name),
    ['a', 'A.md', 'b.md']
  )
  assert.equal(sorted[0], nodes[1]) // 不修改原数组（复制排序）
})

test('buildNodes：文件夹全保留、文件只留受支持格式（md/txt/无后缀/点文件）', () => {
  const items = [
    { name: 'b.txt', isDirectory: false },
    { name: 'sub', isDirectory: true },
    { name: 'a.md', isDirectory: false },
    { name: 'x.yaml', isDirectory: false }, // 不支持：过滤
    { name: 'README', isDirectory: false }, // 无后缀：保留
    { name: '.gitignore', isDirectory: false } // 点文件：保留
  ]
  const nodes = buildNodes(items, 'parent')
  // zh locale 排序：目录在前，文件按 localeCompare('zh')（实测 'README' 排最末，与 Sidebar 原实现一致）
  assert.deepEqual(nodes.map((n) => n.name), ['sub', '.gitignore', 'a.md', 'b.txt', 'README'])
  assert.deepEqual(nodes.map((n) => n.relPath), [
    'parent/sub',
    'parent/.gitignore',
    'parent/a.md',
    'parent/b.txt',
    'parent/README'
  ])
  assert.ok(nodes.every((n) => n.expanded === false && n.children === null))
})

test('updateNode：不可变更新命中节点（含递归子级）', () => {
  const tree = [
    {
      name: 'd1',
      relPath: 'd1',
      isDir: true,
      children: [{ name: 'f', relPath: 'd1/f', isDir: false, expanded: false }]
    },
    { name: 'd2', relPath: 'd2', isDir: true, children: null }
  ]
  const next = updateNode(tree, 'd1/f', (n) => ({ ...n, expanded: true }))
  assert.equal(next[0].children[0].expanded, true)
  assert.equal(tree[0].children[0].expanded, false) // 原树未被修改
  assert.equal(next[1], tree[1]) // 未命中的兄弟节点引用保持
})

test('replaceNode：整体替换命中节点（9.2.3 递归展开后替换）', () => {
  const tree = [{ name: 'd', relPath: 'd', isDir: true, children: null }]
  const replacement = { name: 'd', relPath: 'd', isDir: true, expanded: true, children: [] }
  const next = replaceNode(tree, 'd', replacement)
  assert.equal(next[0], replacement)
  assert.notEqual(tree[0], replacement)
})

test('refreshTreeNodes：磁盘已删移除、新增追加、展开的文件夹递归刷新、保留展开态', async () => {
  // 磁盘上已无 'gone'（外部删除）；树中还残留该节点 → 刷新后移除
  const fs = mockFs({
    '.': [
      { name: 'keep', isDirectory: true },
      { name: 'new.md', isDirectory: false }
    ],
    'keep': [
      { name: 'inner.md', isDirectory: false },
      { name: 'inner2.md', isDirectory: false }
    ]
  })
  const nodes = [
    { name: 'keep', relPath: 'keep', isDir: true, expanded: true, children: [{ name: 'old.md', relPath: 'keep/old.md', isDir: false }] },
    { name: 'gone', relPath: 'gone', isDir: false }
  ]
  const next = await refreshTreeNodes(fs, nodes, '')
  assert.deepEqual(next.map((n) => n.name), ['keep', 'new.md']) // gone 移除、new 追加（keep 目录在前）
  const keep = next.find((n) => n.name === 'keep')
  assert.equal(keep.expanded, true)
  assert.deepEqual(keep.children.map((c) => c.name), ['inner.md', 'inner2.md']) // old.md 移除、新增入
})

test('refreshTreeNodes：未展开的目录不递归、保留原有 children 引用', async () => {
  const fs = mockFs({ '.': [{ name: 'd', isDirectory: true }] })
  const children = [{ name: 'x.md', relPath: 'd/x.md', isDir: false }]
  const nodes = [{ name: 'd', relPath: 'd', isDir: true, expanded: false, children }]
  const next = await refreshTreeNodes(fs, nodes, '')
  assert.equal(next[0].children, children) // 未展开：children 原样保留
})

test('uniqueName：重名自动加序号（文件与文件夹形态）', async () => {
  const fs = mockFs({
    '.': [
      { name: '未命名.md', isDirectory: false },
      { name: '未命名 2.md', isDirectory: false },
      { name: 'notes', isDirectory: true }
    ]
  })
  assert.equal(await uniqueName(fs, '', '未命名.md'), '未命名 3.md')
  assert.equal(await uniqueName(fs, '', 'notes'), 'notes 2')
  assert.equal(await uniqueName(fs, '', 'new.md'), 'new.md') // 无冲突原样
})

test('uniqueName：空目录根用 "." 调用 listDetail', async () => {
  let called = null
  const fs = {
    async listDetail(p) {
      called = p
      return []
    }
  }
  await uniqueName(fs, '', 'a.md')
  assert.equal(called, '.')
})
