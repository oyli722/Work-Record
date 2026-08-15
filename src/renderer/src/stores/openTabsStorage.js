// 打开标签列表持久化（7.4，PRD §4.7.3：应用重启恢复）
// CC-3 格式迁移：string[]（relPath）→ object[]（{ type:'file', relPath } | { type:'terminal', cwdRelPath, title }）
// 职责：读取（含旧格式迁移）+ 增删改查写回。editorStore / App 不再内联 localStorage 读写
// （原 editorStore 内联 5 处 + App 1 处，格式细节分散）。
// 纯函数模块（仅依赖 localStorage），供渲染进程使用；后续可单测。

export const OPEN_TABS_KEY = 'mework.openTabs'

/** 读取并迁移持久化的打开标签列表（供 App 启动恢复）：
    旧格式 string 元素视为 file 条目（设计 §3.1 兼容迁移）；object 按 type 归类；非法项过滤。 */
export function readOpenTabs() {
  try {
    const list = JSON.parse(localStorage.getItem(OPEN_TABS_KEY) ?? '[]')
    if (!Array.isArray(list)) return []
    return list
      .map((item) => {
        if (typeof item === 'string') {
          return item.length > 0 ? { type: 'file', relPath: item } : null
        }
        if (item && typeof item === 'object') {
          if (item.type === 'terminal') {
            const cwdRelPath = typeof item.cwdRelPath === 'string' ? item.cwdRelPath : '.'
            const title = typeof item.title === 'string' && item.title ? item.title : '终端'
            return { type: 'terminal', cwdRelPath, title }
          }
          const relPath = typeof item.relPath === 'string' ? item.relPath : ''
          return relPath ? { type: 'file', relPath } : null
        }
        return null
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

/** 追加标签条目。file 按 relPath、terminal 按 cwd+title 去重（P2-4：防重复入表） */
export function addOpenTab(entry) {
  const dup = readOpenTabs().some((it) =>
    entry.type === 'terminal'
      ? it.type === 'terminal' && it.cwdRelPath === entry.cwdRelPath && it.title === entry.title
      : it.type === 'file' && it.relPath === entry.relPath
  )
  if (dup) return
  writeOpenTabs([...readOpenTabs(), entry])
}

/** 移除满足 predicate 的条目（关闭标签：file 按 relPath、terminal 按 cwd+title 匹配） */
export function removeOpenTabs(predicate) {
  writeOpenTabs(readOpenTabs().filter((it) => !predicate(it)))
}

/** 更新满足 predicate 的条目（重命名等；mutator 返回新条目） */
export function updateOpenTabs(predicate, mutator) {
  writeOpenTabs(readOpenTabs().map((it) => (predicate(it) ? mutator(it) : it)))
}

/** 清空打开列表（切换工作区 / 关闭全部标签） */
export function clearOpenTabs() {
  writeOpenTabs([])
}

function writeOpenTabs(list) {
  try {
    localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(list))
  } catch {
    /* localStorage 不可用：静默降级，打开列表仅本次会话生效 */
  }
}
