// 文件格式注册表（最小形态，V1.1 前置——规划见《docs/V1.1-规划.md》§3.1）
// 目录树过滤 / 新建文件后缀 / 预览路由 / 版本导出 filters 统一查此注册表，
// 消除格式判断在 Sidebar / NewFileModal / EditorPane / version-handlers 的硬编码散布
// （原四处各自维护一份 md/txt 判断，易漂移）。
// 主进程与渲染进程共用（同 link-policy.js 模式）。
// V1.1 扩展点：语言映射（CodeMirror）、预览形态（code/data/text）、自定义后缀（设置页），均在此扩展。

/** 内置支持后缀（含点，小写）。当前仅 md / txt（9.2.8 定案）；V1.1 随注册表扩展 */
const SUPPORTED_EXTS = new Set(['.md', '.txt'])

/** 后缀（含点，大小写不敏感）是否受支持 */
export function isSupportedExt(ext) {
  return typeof ext === 'string' && SUPPORTED_EXTS.has(ext.toLowerCase())
}

/** 文件名/相对路径是否受支持（md/txt；无后缀文件；点文件——9.2.8 目录树范围定案） */
export function isSupportedFile(name) {
  const n = String(name ?? '')
  if (!n.includes('.')) return true // 无后缀文件
  if (n.startsWith('.')) return true // 点文件（.gitignore 等，随目录树显示）
  const dot = n.lastIndexOf('.')
  return dot > 0 && isSupportedExt(n.slice(dot))
}

/** 是否按 Markdown 渲染（预览路由；当前仅 .md，TXT 退化为纯文本） */
export function isMarkdownFile(name) {
  return /\.md$/i.test(String(name ?? ''))
}

/** 新建文件可选后缀（'' 表示无后缀；NewFileModal 选项来源，V1.1 随注册表扩展） */
export const NEW_FILE_SUFFIXES = ['', '.md', '.txt']

/** 版本导出的「另存为」filters（主进程 version-handlers 使用；主/渲染共用模块） */
export const VERSION_EXPORT_FILTERS = [
  { name: 'Markdown', extensions: ['md'] },
  { name: '文本', extensions: ['txt'] },
  { name: '所有文件', extensions: ['*'] }
]
