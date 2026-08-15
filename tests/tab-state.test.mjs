import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveFileState } from '../src/renderer/src/utils/tab-state.js'

// 活动标签派生状态（utils/tab-state.js）：OPT-3a 渲染进程纯函数补测

const fileTab = {
  type: 'file',
  key: 'a.md',
  relPath: 'a.md',
  content: 'hi',
  saveState: 'dirty',
  error: null,
  loading: false,
  externalChange: false
}

test('file 标签：派生 file 语义状态', () => {
  assert.deepEqual(deriveFileState(fileTab), {
    currentFile: 'a.md',
    content: 'hi',
    saveState: 'dirty',
    dirty: true,
    error: null,
    loading: false,
    externalChange: false
  })
})

test('terminal 标签 / null：恒为 file 空值', () => {
  const empty = {
    currentFile: null,
    content: '',
    saveState: 'saved',
    dirty: false,
    error: null,
    loading: false,
    externalChange: false
  }
  assert.deepEqual(deriveFileState({ type: 'terminal', key: 'terminal:x', termId: 'x' }), empty)
  assert.deepEqual(deriveFileState(null), empty)
  assert.deepEqual(deriveFileState(undefined), empty)
})

test('saved 状态的 file 标签 dirty=false', () => {
  const saved = deriveFileState({ ...fileTab, saveState: 'saved' })
  assert.equal(saved.dirty, false)
  assert.equal(saved.saveState, 'saved')
})
