// 通用确认弹窗（4.4 删除二次确认，用户定案：渲染层自绘、主题统一）
// 遮罩 + 居中卡片；确认 / 取消按钮；点击遮罩或 Esc 取消。
import { useEffect } from 'react'

export default function ConfirmDialog({
  title,
  message,
  warning,
  confirmLabel = '删除',
  onConfirm,
  onCancel
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="confirm-dialog__mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="confirm-dialog" role="alertdialog" aria-modal="true">
        <h3 className="confirm-dialog__title">{title}</h3>
        <p className="confirm-dialog__message">{message}</p>
        {warning && <p className="confirm-dialog__warning">{warning}</p>}
        <div className="confirm-dialog__actions">
          <button type="button" className="confirm-dialog__btn" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--danger"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
