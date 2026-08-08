// 预览区（阶段 3.4/3.5：markdown-it + DOMPurify 渲染，暖纸阅读面）
// isMarkdown=false（TXT）退化为纯文本 pre 呈现。
// 相对图片经 baseDir 解析为 mework-file://（3.5），外链系统打开随 3.6。
import { useMemo } from 'react'
import { renderMarkdown } from '../utils/markdown'

export default function PreviewPane({ content, isMarkdown, baseDir }) {
  const html = useMemo(
    () => (isMarkdown ? renderMarkdown(content, baseDir) : ''),
    [content, isMarkdown, baseDir]
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
