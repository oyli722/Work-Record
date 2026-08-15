import { useEffect, useRef, useState } from 'react'
import { CloseIcon, TerminalIcon } from './icons'
import ContextMenu from './ContextMenu'

// 标签栏（阶段 7.2，PRD §4.7.1/4.7.2；CC-3 Tab 模型扩展，设计文档 §3.1/§3.2）：编辑器上方一行
// CC-3 起按 key 渲染（file tab key === relPath；terminal tab key === `terminal:${termId}`），
// 两类 Tab 统一渲染但**视觉可区分**（D5）：终端 Tab 显示终端图标 + 文件夹名 + 区分样式。
// 每标签：文件名 + ●未保存（仅 file）+ ✕ 关闭；活动标签高亮；点击切换。
// 未保存关闭经 onCloseRequest 交由 EditorPane 弹三选（7.3）；terminal 关闭无未保存 → 直接确认关（D7）。
// 9.2.2 右键菜单：关闭 / 关闭其他 / 关闭左侧 / 关闭右侧 / 全部关闭（未保存逐个三选，经 onBatchClose）。

/** 相对路径取文件名 */
export function fileNameOf(relPath) {
  const i = relPath.lastIndexOf('/')
  return i === -1 ? relPath : relPath.slice(i + 1)
}

/** 标签显示名：file 取文件名；terminal 取文件夹名（tab.title） */
function tabLabel(tab) {
  return tab.type === 'terminal' ? tab.title : fileNameOf(tab.relPath)
}

export default function TabBar({ editor, onCloseRequest, onBatchClose }) {
  const { tabs, activeKey, activateTab, closeTab, confirmCloseTab } = editor
  const [menu, setMenu] = useState(null) // 右键菜单：{ x, y, key }
  const tabbarRef = useRef(null) // 标签栏滚动容器
  const tabRefs = useRef(new Map()) // key -> 标签元素（活动标签自动滚动）

  // 9.3.1 活动标签切换后自动滚动到可视区（只滚动标签栏，不影响主区）
  useEffect(() => {
    const bar = tabbarRef.current
    const el = tabRefs.current.get(activeKey)
    if (!bar || !el) return
    const elRect = el.getBoundingClientRect()
    const barRect = bar.getBoundingClientRect()
    const tabLeft = elRect.left - barRect.left + bar.scrollLeft
    const tabRight = tabLeft + el.offsetWidth
    if (tabLeft < bar.scrollLeft) bar.scrollLeft = tabLeft
    else if (tabRight > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = tabRight - bar.clientWidth
  }, [activeKey])

  // 9.3.1 鼠标滚轮横向滚动标签栏（仅当标签溢出时劫持，不影响主区滚动）
  useEffect(() => {
    const bar = tabbarRef.current
    if (!bar) return
    function onWheel(e) {
      if (bar.scrollWidth <= bar.clientWidth) return // 无横向溢出：放行
      e.preventDefault()
      bar.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    }
    bar.addEventListener('wheel', onWheel, { passive: false })
    return () => bar.removeEventListener('wheel', onWheel)
  }, [])

  if (tabs.length === 0) return null

  function handleClose(e, key) {
    e.stopPropagation()
    const { needsConfirm } = closeTab(key)
    if (needsConfirm) onCloseRequest(key) // 未保存：EditorPane 弹三选
    else confirmCloseTab(key)
  }

  /** 右键标签：打开批量关闭菜单（ContextMenu 为 fixed 定位，不受 tabbar 横向滚动裁剪） */
  function openMenu(e, key) {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, key })
  }

  // CC-4 分组（用户定案）：终端 Tab 与文件 Tab 分离——终端组固定在最左侧、文件组在其右侧，
  // 组间分隔线，避免混排混乱；点击任意 Tab 即跳转（激活切换）。
  const terminalTabs = tabs.filter((t) => t.type === 'terminal')
  const fileTabs = tabs.filter((t) => t.type === 'file')
  // 显示顺序（批量关闭的左右语义也按此顺序）
  const orderedTabs = [...terminalTabs, ...fileTabs]
  const idx = menu ? orderedTabs.findIndex((t) => t.key === menu.key) : -1
  const menuItems = menu
    ? [
        { label: '关闭此标签', onClick: () => onBatchClose([menu.key]) },
        {
          label: '关闭其他标签',
          onClick: () => onBatchClose(orderedTabs.filter((t) => t.key !== menu.key).map((t) => t.key)),
          disabled: orderedTabs.length <= 1
        },
        {
          label: '关闭左侧标签',
          onClick: () => onBatchClose(orderedTabs.filter((_, i) => i < idx).map((t) => t.key)),
          disabled: idx <= 0
        },
        {
          label: '关闭右侧标签',
          onClick: () => onBatchClose(orderedTabs.filter((_, i) => i > idx).map((t) => t.key)),
          disabled: idx >= orderedTabs.length - 1
        },
        { label: '全部关闭', onClick: () => onBatchClose(orderedTabs.map((t) => t.key)) }
      ]
    : []

  /** 单个 Tab 渲染（文件/终端统一，终端带图标 + 区分样式；CC-3 起按 key 寻址） */
  function renderTab(tab) {
    const active = tab.key === activeKey
    const dirty = tab.type === 'file' && tab.saveState === 'dirty'
    const isTerminal = tab.type === 'terminal'
    return (
      <div
        key={tab.key}
        role="tab"
        aria-selected={active}
        ref={(el) => {
          if (el) tabRefs.current.set(tab.key, el)
          else tabRefs.current.delete(tab.key)
        }}
        className={`tabbar__tab${active ? ' tabbar__tab--active' : ''}${
          isTerminal ? ' tabbar__tab--terminal' : ''
        }`}
        onClick={() => activateTab(tab.key)}
        onContextMenu={(e) => openMenu(e, tab.key)}
        title={isTerminal ? `${tab.title} — 终端（${tab.cwdRelPath}）` : tab.relPath}
      >
        {isTerminal && <TerminalIcon width={14} height={14} className="tabbar__icon" />}
        <span className="tabbar__name">
          {tabLabel(tab)}
          {dirty && <span className="tabbar__dirty" aria-label="未保存" />}
        </span>
        <button
          type="button"
          className="tabbar__close"
          onClick={(e) => handleClose(e, tab.key)}
          aria-label="关闭标签"
          title="关闭"
        >
          <CloseIcon width={12} height={12} />
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="tabbar" role="tablist" ref={tabbarRef}>
        {terminalTabs.length > 0 && (
          <div className="tabbar__group tabbar__group--terminal" role="presentation">
            {terminalTabs.map(renderTab)}
          </div>
        )}
        {terminalTabs.length > 0 && fileTabs.length > 0 && (
          <div className="tabbar__group-sep" role="presentation" aria-hidden="true" />
        )}
        {fileTabs.length > 0 && (
          <div className="tabbar__group tabbar__group--file" role="presentation">
            {fileTabs.map(renderTab)}
          </div>
        )}
      </div>

      {/* 9.2.2 标签右键菜单（关闭/关闭其他/关闭左侧/关闭右侧/全部关闭） */}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </>
  )
}
