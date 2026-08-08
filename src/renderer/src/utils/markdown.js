// Markdown 渲染工具（阶段 3.4，PRD §4.4.1）
// markdown-it 渲染标准语法（标题/列表/表格/代码块/引用/图片/链接/行内样式），
// DOMPurify 对输出 HTML 做白名单清理（XSS 兜底，html:false 已先禁原始 HTML）。
// 图片路径解析（相对/远程）与外链系统打开分别随 3.5 / 3.6 落地。

import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({
  html: false, // 不渲染原始 HTML（原样转义输出，配合 DOMPurify 双保险）
  linkify: true, // 裸 URL 自动转链接
  typographer: true // 智能标点（引号/省略号等）
  // tables 默认开启（GFM 表格，PRD §4.4.1）
})

/** 将 Markdown 源渲染为经 DOMPurify 清理的 HTML 字符串 */
export function renderMarkdown(src) {
  return DOMPurify.sanitize(md.render(String(src ?? '')))
}
