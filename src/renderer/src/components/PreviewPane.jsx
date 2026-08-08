// 预览区（阶段 3.4：markdown-it + DOMPurify 渲染，暖纸阅读面）
// isMarkdown=false（TXT）退化为纯文本 pre 呈现。图片加载（相对/远程）随 3.5，外链随 3.6。
import { useMemo } from 'react'
import { renderMarkdown } from '../utils/markdown'

export default function PreviewPane({ content, isMarkdown }) {
  const html = useMemo(
    () => (isMarkdown ? renderMarkdown(content) : ''),
    [content, isMarkdown]
  )

  if (!isMarkdown) {
    return (
      <div className="preview">
        <pre className="preview__text">{content}</pre>
      </div>
    )
  }
  return (
    <div className="preview">
      <div className="preview__md" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
