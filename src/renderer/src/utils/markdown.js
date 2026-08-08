// Markdown 渲染工具（阶段 3.4/3.5，PRD §4.4）
// markdown-it 渲染标准语法（标题/列表/表格/代码块/引用/图片/链接/行内样式），
// DOMPurify 对输出 HTML 做白名单清理（XSS 兜底，html:false 已先禁原始 HTML）。
// 图片路径解析（PRD §4.4.2/§4.4.5）：相对路径基于当前文件所在目录 → mework-file:///
// 由主进程经 pathGuard 读图；远程 https / data: 原样保留。外链系统打开随 3.6。

import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({
  html: false, // 不渲染原始 HTML（原样转义输出，配合 DOMPurify 双保险）
  linkify: true, // 裸 URL 自动转链接
  typographer: true // 智能标点（引号/省略号等）
  // tables 默认开启（GFM 表格，PRD §4.4.1）
})

// 覆盖 image 渲染规则：相对 src 基于 env.baseDir 拼成工作区相对路径 → mework-file:///
// 含协议（https/data/mework-file）或绝对路径（/）的 src 原样保留
const defaultImageRender = md.renderer.rules.image
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const src = token.attrGet('src') || ''
  if (src && !/^(https?:|data:|mework-file:|\/)/i.test(src)) {
    const baseDir = (env && env.baseDir) || ''
    const rel = baseDir ? `${baseDir}/${src}` : src
    // standard scheme 需非空 host（空 host 无法解析），用固定 host「img」
    token.attrSet('src', `mework-file://img/${encodeURIComponent(rel)}`)
  }
  return defaultImageRender
    ? defaultImageRender(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options)
}

// DOMPurify URI 白名单：默认协议外追加 mework-file（3.5 本地图，否则 src 会被清理）
const ALLOWED_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|mework-file):|[^a-z]|[a-z+.-]+(?:[^a-z+]|\/))/i

/**
 * 将 Markdown 源渲染为经 DOMPurify 清理的 HTML 字符串。
 * @param {string} src Markdown 源
 * @param {string} [baseDir] 当前文件所在目录（工作区内相对路径，用于解析相对图片）
 */
export function renderMarkdown(src, baseDir = '') {
  const html = md.render(String(src ?? ''), { baseDir })
  return DOMPurify.sanitize(html, { ALLOWED_URI_REGEXP })
}
