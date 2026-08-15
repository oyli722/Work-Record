import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  OPEN_TABS_KEY,
  readOpenTabs,
  addOpenTab,
  removeOpenTabs,
  updateOpenTabs,
  clearOpenTabs
} from '../src/renderer/src/stores/openTabsStorage.js'

// 打开标签持久化（openTabsStorage.js）：OPT-2a 渲染进程纯函数补测
// node 环境无 localStorage，先装内存 mock（模块在调用时读取，非导入时）。

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
}

beforeEach(() => {
  store.clear()
})

test('readOpenTabs：空 / 非法 JSON / 非数组 降级空数组', () => {
  assert.deepEqual(readOpenTabs(), [])
  localStorage.setItem(OPEN_TABS_KEY, 'not-json{')
  assert.deepEqual(readOpenTabs(), [])
  localStorage.setItem(OPEN_TABS_KEY, '"str"')
  assert.deepEqual(readOpenTabs(), [])
})

test('readOpenTabs：旧格式 string[] 迁移为 file 条目（CC-3 兼容）', () => {
  localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(['a.md', '', 'b.txt']))
  assert.deepEqual(readOpenTabs(), [
    { type: 'file', relPath: 'a.md' },
    { type: 'file', relPath: 'b.txt' }
  ])
})

test('readOpenTabs：object 按 type 归类，非法项过滤', () => {
  localStorage.setItem(
    OPEN_TABS_KEY,
    JSON.stringify([
      { type: 'file', relPath: 'a.md' },
      { type: 'terminal', cwdRelPath: 'sub', title: 'sub' },
      { type: 'terminal', cwdRelPath: 3 }, // 非法 cwd → 默认 '.'
      { type: 'unknown' }, // 非法 type → 按 file 处理但无 relPath → 过滤
      null
    ])
  )
  assert.deepEqual(readOpenTabs(), [
    { type: 'file', relPath: 'a.md' },
    { type: 'terminal', cwdRelPath: 'sub', title: 'sub' },
    { type: 'terminal', cwdRelPath: '.', title: '终端' }
  ])
})

test('addOpenTab：追加 file；重复 relPath 去重', () => {
  addOpenTab({ type: 'file', relPath: 'a.md' })
  addOpenTab({ type: 'file', relPath: 'a.md' }) // 重复：忽略
  addOpenTab({ type: 'file', relPath: 'b.md' })
  assert.deepEqual(readOpenTabs(), [
    { type: 'file', relPath: 'a.md' },
    { type: 'file', relPath: 'b.md' }
  ])
})

test('addOpenTab：terminal 按 cwd+title 去重（P2-4）', () => {
  addOpenTab({ type: 'terminal', cwdRelPath: 'sub', title: 'sub' })
  addOpenTab({ type: 'terminal', cwdRelPath: 'sub', title: 'sub' }) // 重复：忽略
  addOpenTab({ type: 'terminal', cwdRelPath: 'other', title: 'other' })
  assert.equal(readOpenTabs().length, 2)
})

test('removeOpenTabs：按 predicate 移除（file 按 relPath / terminal 按 cwd+title）', () => {
  localStorage.setItem(
    OPEN_TABS_KEY,
    JSON.stringify([
      { type: 'file', relPath: 'a.md' },
      { type: 'file', relPath: 'b.md' },
      { type: 'terminal', cwdRelPath: 'sub', title: 'sub' }
    ])
  )
  removeOpenTabs((it) => it.type === 'file' && it.relPath === 'a.md')
  removeOpenTabs((it) => it.type === 'terminal' && it.cwdRelPath === 'sub' && it.title === 'sub')
  assert.deepEqual(readOpenTabs(), [{ type: 'file', relPath: 'b.md' }])
})

test('updateOpenTabs：重命名映射（旧路径 → 新路径）', () => {
  localStorage.setItem(OPEN_TABS_KEY, JSON.stringify([{ type: 'file', relPath: 'a.md' }]))
  updateOpenTabs((it) => it.type === 'file' && it.relPath === 'a.md', (it) => ({ ...it, relPath: 'b.md' }))
  assert.deepEqual(readOpenTabs(), [{ type: 'file', relPath: 'b.md' }])
})

test('clearOpenTabs 清空', () => {
  addOpenTab({ type: 'file', relPath: 'a.md' })
  clearOpenTabs()
  assert.deepEqual(readOpenTabs(), [])
})
