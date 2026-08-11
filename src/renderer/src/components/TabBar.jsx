import { useState } from 'react'
import { CloseIcon } from './icons'
import ContextMenu from './ContextMenu'

// 标签栏（阶段 7.2，PRD §4.7.1/4.7.2）：编辑器上方一行
// 每标签：文件名 + ●未保存 + ✕ 关闭；活动标签高亮；点击切换。
// 未保存关闭经 onCloseRequest 交由 EditorPane 弹三选（7.3 细化外部改动检测）。
// 9.2.2 右键菜单：关闭 / 关闭其他 / 关闭左侧 / 关闭右侧 / 全部关闭（未保存逐个三选，经 onBatchClose）。

/** 相对路径取文件名 */
export function fileNameOf(relPath) {
  const i = relPath.lastIndexOf('/')
  return i === -1 ? relPath : relPath.slice(i + 1)
}

export default function TabBar({ editor, onCloseRequest, onBatchClose }) {
  const { tabs, activeRelPath, activateTab, closeTab, confirmCloseTab } = editor
  const [menu, setMenu] = useState(null) // 右键菜单：{ x, y, relPath }
  if (tabs.length === 0) return null

  function handleClose(e, relPath) {
    e.stopPropagation()
    const { needsConfirm } = closeTab(relPath)
    if (needsConfirm) onCloseRequest(relPath) // 未保存：EditorPane 弹三选
    else confirmCloseTab(relPath)
  }

  /** 右键标签：打开批量关闭菜单（ContextMenu 为 fixed 定位，不受 tabbar 横向滚动裁剪） */
  function openMenu(e, relPath) {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, relPath })
  }

  const idx = menu ? tabs.findIndex((t) => t.relPath === menu.relPath) : -1
  const menuItems = menu
    ? [
        { label: '关闭此标签', onClick: () => onBatchClose([menu.relPath]) },
        {
          label: '关闭其他标签',
          onClick: () => onBatchClose(tabs.filter((t) => t.relPath !== menu.relPath).map((t) => t.relPath)),
          disabled: tabs.length <= 1
        },
        {
          label: '关闭左侧标签',
          onClick: () => onBatchClose(tabs.filter((_, i) => i < idx).map((t) => t.relPath)),
          disabled: idx <= 0
        },
        {
          label: '关闭右侧标签',
          onClick: () => onBatchClose(tabs.filter((_, i) => i > idx).map((t) => t.relPath)),
          disabled: idx >= tabs.length - 1
        },
        { label: '全部关闭', onClick: () => onBatchClose(tabs.map((t) => t.relPath)) }
      ]
    : []

  return (
    <>
      <div className="tabbar" role="tablist">
        {tabs.map((tab) => {
          const active = tab.relPath === activeRelPath
          const dirty = tab.saveState === 'dirty'
          return (
            <div
              key={tab.relPath}
              role="tab"
              aria-selected={active}
              className={`tabbar__tab${active ? ' tabbar__tab--active' : ''}`}
              onClick={() => activateTab(tab.relPath)}
              onContextMenu={(e) => openMenu(e, tab.relPath)}
              title={tab.relPath}
            >
              <span className="tabbar__name">
                {fileNameOf(tab.relPath)}
                {dirty && <span className="tabbar__dirty" aria-label="未保存" />}
              </span>
              <button
                type="button"
                className="tabbar__close"
                onClick={(e) => handleClose(e, tab.relPath)}
                aria-label="关闭标签"
                title="关闭"
              >
                <CloseIcon width={12} height={12} />
              </button>
            </div>
          )
        })}
      </div>

      {/* 9.2.2 标签右键菜单（关闭/关闭其他/关闭左侧/关闭右侧/全部关闭） */}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </>
  )
}
