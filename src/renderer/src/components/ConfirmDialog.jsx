// 通用确认弹窗（4.4 删除二次确认，用户定案：渲染层自绘、主题统一）
// 遮罩 + 居中卡片；确认 / 取消按钮；7.2 起支持第三按钮（altLabel，如「放弃」），点击遮罩或 Esc 取消。
// 9.2.5 焦点管理：
//   - 打开时聚焦安全默认——danger 弹窗（删除等）聚焦「取消」防误触，其余聚焦主操作
//   - Tab 焦点困在弹窗内循环（键盘可达）；关闭 / Esc 后还原到先前焦点
import { useEffect, useRef } from 'react'

export default function ConfirmDialog({
  title,
  message,
  warning,
  confirmLabel = '删除',
  confirmDanger = true,
  altLabel,
  altDanger = false,
  onConfirm,
  onAlt,
  onCancel
}) {
  const maskRef = useRef(null)
  const cancelBtnRef = useRef(null)
  const confirmBtnRef = useRef(null)
  const altBtnRef = useRef(null)

  useEffect(() => {
    const prev = document.activeElement
    // 聚焦安全默认：danger（删除等破坏性操作）聚焦「取消」防 Enter 误触；否则聚焦主操作
    if (confirmDanger) cancelBtnRef.current?.focus()
    else if (confirmBtnRef.current) confirmBtnRef.current.focus()
    else altBtnRef.current?.focus()

    function onKey(e) {
      if (e.key === 'Escape') {
        onCancel()
        return
      }
      if (e.key === 'Tab') {
        // 焦点圈：Tab 在弹窗内按钮间循环（键盘可达，9.2.5）
        const els = maskRef.current
          ? [...maskRef.current.querySelectorAll('button:not(:disabled)')]
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
      prev?.focus?.() // 关闭还原焦点
    }
  }, [onCancel, confirmDanger])

  return (
    <div
      className="confirm-dialog__mask"
      ref={maskRef}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="confirm-dialog" role="alertdialog" aria-modal="true">
        <h3 className="confirm-dialog__title">{title}</h3>
        <p className="confirm-dialog__message">{message}</p>
        {warning && <p className="confirm-dialog__warning">{warning}</p>}
        <div className="confirm-dialog__actions">
          <button ref={cancelBtnRef} type="button" className="confirm-dialog__btn" onClick={onCancel}>
            取消
          </button>
          {altLabel && (
            <button
              ref={altBtnRef}
              type="button"
              className={`confirm-dialog__btn${altDanger ? ' confirm-dialog__btn--danger' : ''}`}
              onClick={onAlt}
            >
              {altLabel}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            className={`confirm-dialog__btn${confirmDanger ? ' confirm-dialog__btn--danger' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
