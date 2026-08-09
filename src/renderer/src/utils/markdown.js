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

// 3.7 分屏同步滚动锚点：给块级元素注入 data-src-line（源码起始行，1-based），
// 供预览区按顶部可见行联动定位（PRD §4.2.6）。token.map 为 markdown-it 0-based 源行。
// DOMPurify 默认允许 data-* 属性，sanitize 后锚点保留。分两类 token：
//   - open/close 对：规则键为 `${type}_open`
//   - 自闭合块级：规则键即类型本身（fence / code_block / hr）
const PAIRED_BLOCK_OPEN = ['paragraph', 'heading', 'list_item', 'blockquote', 'table', 'tr', 'th', 'td']
for (const type of PAIRED_BLOCK_OPEN) {
  const key = `${type}_open`
  // 此类 open 规则 markdown-it 多数无默认实现（走 renderToken 通用属性渲染），
  // 有默认规则则透传，无则回退 renderToken（会输出 token.attrs → data-src-line）。
  const defaultRule = md.renderer.rules[key]
  md.renderer.rules[key] = (tokens, idx, options, env, self) => {
    const t = tokens[idx]
    if (t.map) t.attrSet('data-src-line', String(t.map[0] + 1))
    return defaultRule
      ? defaultRule(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
  }
}
for (const type of ['fence', 'code_block', 'hr']) {
  const defaultRule = md.renderer.rules[type]
  if (!defaultRule) continue
  md.renderer.rules[type] = (tokens, idx, options, env, self) => {
    const t = tokens[idx]
    if (t.map) t.attrSet('data-src-line', String(t.map[0] + 1))
    return defaultRule(tokens, idx, options, env, self)
  }
}

// DOMPurify URI 白名单：官方语义 + 追加 mework-file（3.5 本地图，否则 src 会被清理）。
// 第三分支保留官方「冒号排除」语义（[^a-z+.-:]），阻止 javascript:/vbscript:/file: 等
// 危险协议经链接/图片语法注入（评审 P1：先前改写第三分支致 XSS 漏洞）。
const ALLOWED_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|mework-file):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i

/**
 * 将 Markdown 源渲染为经 DOMPurify 清理的 HTML 字符串。
 * @param {string} src Markdown 源
 * @param {string} [baseDir] 当前文件所在目录（工作区内相对路径，用于解析相对图片）
 */
export function renderMarkdown(src, baseDir = '') {
  const html = md.render(String(src ?? ''), { baseDir })
  return DOMPurify.sanitize(html, { ALLOWED_URI_REGEXP })
}
