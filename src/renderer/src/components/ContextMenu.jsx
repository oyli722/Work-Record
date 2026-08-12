// 通用右键菜单（阶段 4：目录树 CRUD 的唯一入口，用户定案）
// 渲染层自绘、绝对定位在触发点；点击外部 / Esc 关闭。
// 9.2.5 打磨：
//   - 位置避让：useLayoutEffect 测量实际尺寸后夹取到视口内（右缘/底缘不溢出）
//   - 键盘可达：打开聚焦首个可用项；↑/↓ 在项间移动，Enter/Space 触发，Esc 关闭
// items: [{ label, onClick, danger?, disabled? }]
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const MARGIN = 8 // 距视口边缘最小间距

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  // 9.2.5 位置状态：先以触发点渲染，useLayoutEffect（paint 前）测量后夹取
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - rect.width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, window.innerHeight - rect.height - MARGIN))
    })
  }, [x, y])

  // 9.2.5 打开聚焦首个可用项（键盘用户可达）
  useEffect(() => {
    const first = ref.current?.querySelector('.context-menu__item:not(:disabled)')
    first?.focus()
  }, [])

  // 点击外部 / Esc 关闭；↑/↓ 键盘导航（9.2.5）
  useEffect(() => {
    function onDocMouseDown(e) {
      if (!ref.current?.contains(e.target)) onClose()
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const els = [...(ref.current?.querySelectorAll('.context-menu__item:not(:disabled)') ?? [])]
        if (els.length === 0) return
        const idx = els.indexOf(document.activeElement)
        const next =
          e.key === 'ArrowDown' ? (idx + 1) % els.length : (idx - 1 + els.length) % els.length
        els[next]?.focus()
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="context-menu" style={{ left: pos.left, top: pos.top }} ref={ref} role="menu">
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
