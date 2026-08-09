// 通用右键菜单（阶段 4：目录树 CRUD 的唯一入口，用户定案）
// 渲染层自绘、绝对定位在触发点；点击外部 / Esc 关闭。
// items: [{ label, onClick, danger?, disabled? }]
import { useEffect, useRef } from 'react'

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    // 点击菜单外部关闭；Esc 关闭
    function onDocMouseDown(e) {
      if (!ref.current?.contains(e.target)) onClose()
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="context-menu" style={{ left: x, top: y }} ref={ref} role="menu">
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          className={`context-menu__item${item.danger ? ' context-menu__item--danger' : ''}${
            item.disabled ? ' context-menu__item--disabled' : ''
          }`}
          disabled={item.disabled}
          onClick={() => {
            item.onClick?.()
            onClose()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
