// 预览区（阶段 3.4/3.5/3.6：markdown-it + DOMPurify 渲染，暖纸阅读面）
// isMarkdown=false（TXT）退化为纯文本 pre 呈现。
// 相对图片经 baseDir 解析为 mework-file://（3.5）；外链点击 → 系统浏览器/默认程序（3.6）。
// 协议白名单单一来源 src/shared/link-policy.js（评审 S3），主进程同引用。
import { useMemo, useCallback } from 'react'
import { renderMarkdown } from '../utils/markdown'
import { isExternalLink } from '../../../shared/link-policy'

export default function PreviewPane({ content, isMarkdown, baseDir }) {
  const html = useMemo(
    () => (isMarkdown ? renderMarkdown(content, baseDir) : ''),
    [content, isMarkdown, baseDir]
  )

  // 事件委托：命中 <a> 即阻止应用内导航（预览链接当前窗口打开是错误行为），
  // 白名单协议转交系统；其余（# 锚点 / 相对路径 / 未知协议）静默拦截。
  // e.target.closest 兼容链接内嵌 code / strong 等子元素的情况。
  const handleClick = useCallback((e) => {
    const anchor = e.target.closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href') || ''
    e.preventDefault()
    if (isExternalLink(href)) {
      window.mework?.win?.openExternal(href)
    }
  }, [])

  if (!isMarkdown) {
    return (
      <div className="preview">
        <pre className="preview__text">{content}</pre>
      </div>
    )
  }
  return (
    <div className="preview">
      <div
        className="preview__md"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleClick}
      />
    </div>
  )
}
