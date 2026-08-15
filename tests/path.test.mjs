import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirOf, fileNameOf } from '../src/renderer/src/utils/path.js'

// 工作区相对路径工具（utils/path.js）：OPT-3a 渲染进程纯函数补测

test('dirOf 取目录部分', () => {
  assert.equal(dirOf('a/b/c.md'), 'a/b')
  assert.equal(dirOf('a.md'), '')
  assert.equal(dirOf('a/b'), 'a')
})

test('fileNameOf 取文件名（含扩展名）', () => {
  assert.equal(fileNameOf('a/b/c.md'), 'c.md')
  assert.equal(fileNameOf('a.md'), 'a.md')
  assert.equal(fileNameOf('a'), 'a')
})

test('dirOf/fileNameOf 对空字符串安全', () => {
  assert.equal(dirOf(''), '')
  assert.equal(fileNameOf(''), '')
})
