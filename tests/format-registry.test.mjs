import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isSupportedExt,
  isSupportedFile,
  isMarkdownFile,
  NEW_FILE_SUFFIXES,
  VERSION_EXPORT_FILTERS
} from '../src/shared/format-registry.js'

// 文件格式注册表（src/shared/format-registry.js）：OPT-2b 渲染进程纯函数补测
// 9.2.8 定案范围：md/txt；无后缀文件；点文件。

test('isSupportedExt 仅认 md/txt（大小写不敏感）', () => {
  assert.equal(isSupportedExt('.md'), true)
  assert.equal(isSupportedExt('.MD'), true)
  assert.equal(isSupportedExt('.txt'), true)
  assert.equal(isSupportedExt('.yaml'), false)
  assert.equal(isSupportedExt('md'), false) // 缺前导点
  assert.equal(isSupportedExt(''), false)
  assert.equal(isSupportedExt(undefined), false)
})

test('isSupportedFile：md/txt / 无后缀 / 点文件 放行，其余拒绝', () => {
  assert.equal(isSupportedFile('a.md'), true)
  assert.equal(isSupportedFile('a.txt'), true)
  assert.equal(isSupportedFile('README'), true) // 无后缀
  assert.equal(isSupportedFile('.gitignore'), true) // 点文件
  assert.equal(isSupportedFile('a.yaml'), false)
  assert.equal(isSupportedFile('a.js'), false)
  assert.equal(isSupportedFile('a'), true) // 无点
  assert.equal(isSupportedFile(''), false)
  assert.equal(isSupportedFile(undefined), false)
})

test('isMarkdownFile 仅 .md（预览路由）', () => {
  assert.equal(isMarkdownFile('a.md'), true)
  assert.equal(isMarkdownFile('A.MD'), true)
  assert.equal(isMarkdownFile('a.txt'), false)
  assert.equal(isMarkdownFile('a'), false)
  assert.equal(isMarkdownFile(null), false)
})

test('NEW_FILE_SUFFIXES / VERSION_EXPORT_FILTERS 与内置范围一致', () => {
  assert.deepEqual(NEW_FILE_SUFFIXES, ['', '.md', '.txt'])
  const exts = VERSION_EXPORT_FILTERS.flatMap((f) => f.extensions)
  assert.ok(exts.includes('md') && exts.includes('txt') && exts.includes('*'))
})
