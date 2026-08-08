// 预览区（阶段 3.2 占位：纯文本呈现，暖纸阅读面）
// markdown-it + DOMPurify 渲染随 3.4 落地，届时替换为 <div className="markdown-body">。
export default function PreviewPane({ content }) {
  return (
    <div className="preview">
      <pre className="preview__text">{content}</pre>
    </div>
  )
}
