// 新建文件弹窗（9.2.8，用户定案：先建默认名再改）
// 右键「新建文件」→ 已按默认名建空文件并打开 → 本弹窗修改文件名/后缀：
//   确定 → 重命名（重名由 Sidebar 预检拒绝）；取消 / Esc / 点遮罩 → 保留默认名。
// 后缀选项限定「无后缀 / .md / .txt」（2026-08-12 用户定案：当前仅支持这三类；
// 更多格式随 V1.1 格式注册表扩展，届时未配置高亮/预览的后缀也可设置文本化展示）。
// 输入框基名全选：直接输入即整体替换；样式复用确认弹窗 + 树内联输入。
import { useEffect, useRef, useState } from 'react'

const SUFFIX_OPTIONS = [
  { value: '', label: '无后缀' },
  { value: '.md', label: '.md' },
  { value: '.txt', label: '.txt' }
]

/** 从完整文件名拆出基名与后缀（仅识别 md/txt；其余按无后缀处理） */
function splitName(fullName) {
  const m = /^(.+)\.(md|txt)$/i.exec(fullName ?? '')
  if (m) return { base: m[1], suffix: `.${m[2].toLowerCase()}` }
  return { base: fullName ?? '', suffix: '' }
}

export default function NewFileModal({ defaultName, onConfirm, onCancel }) {
  const [parts, setParts] = useState(() => splitName(defaultName))
  const inputRef = useRef(null)
  const maskRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select() // 基名全选：直接输入即整体替换
  }, [])

  // 9.2.5 焦点圈 + Esc 关闭 + 关闭还原焦点（与确认弹窗一致）
  useEffect(() => {
    const prev = document.activeElement
    function onKey(e) {
      if (e.key === 'Escape') {
        onCancel()
        return
      }
      if (e.key === 'Tab') {
        const els = maskRef.current
          ? [...maskRef.current.querySelectorAll('button, input, select:not(:disabled)')]
          : []
        if (els.length === 0) return
        const first = els[0]
        const last = els[els.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [onCancel])

  const submit = () => {
    const base = parts.base.trim()
    if (!base) return // 空基名不提交（保留默认名）
    onConfirm(`${base}${parts.suffix}`)
  }

  return (
    <div
      className="confirm-dialog__mask"
      ref={maskRef}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="confirm-dialog" role="dialog" aria-modal="true">
        <h3 className="confirm-dialog__title">新建文件</h3>
        <p className="confirm-dialog__message">
          已创建「{defaultName}」并打开，可修改文件名与后缀。
        </p>
        <div className="newfile__fields">
          <input
            ref={inputRef}
            className="filetree__input newfile__name"
            value={parts.base}
            onChange={(e) => setParts((p) => ({ ...p, base: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              else if (e.key === 'Escape') onCancel()
            }}
            aria-label="文件名"
          />
          <select
            className="newfile__suffix"
            value={parts.suffix}
            onChange={(e) => setParts((p) => ({ ...p, suffix: e.target.value }))}
            aria-label="文件后缀"
          >
            {SUFFIX_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="confirm-dialog__actions">
          <button type="button" className="confirm-dialog__btn" onClick={onCancel}>
            取消（保留默认名）
          </button>
          <button type="button" className="confirm-dialog__btn" onClick={submit}>
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
