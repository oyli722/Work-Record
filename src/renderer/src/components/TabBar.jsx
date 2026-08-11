// 标签栏（阶段 7.2，PRD §4.7.1/4.7.2）：编辑器上方一行
// 每标签：文件名 + ●未保存 + ✕ 关闭；活动标签高亮；点击切换。
import { CloseIcon } from './icons'

// 未保存关闭经 onCloseRequest 交由 EditorPane 弹三选（7.3 细化外部改动检测）。

/** 相对路径取文件名 */
export function fileNameOf(relPath) {
  const i = relPath.lastIndexOf('/')
  return i === -1 ? relPath : relPath.slice(i + 1)
}

export default function TabBar({ editor, onCloseRequest }) {
  const { tabs, activeRelPath, activateTab, closeTab, confirmCloseTab } = editor
  if (tabs.length === 0) return null

  function handleClose(e, relPath) {
    e.stopPropagation()
    const { needsConfirm } = closeTab(relPath)
    if (needsConfirm) onCloseRequest(relPath) // 未保存：EditorPane 弹三选
    else confirmCloseTab(relPath)
  }

  return (
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
  )
}
