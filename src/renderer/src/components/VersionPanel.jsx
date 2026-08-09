// 版本历史面板（阶段 5.3，PRD §4.5.4）
// 右侧滑出：版本列表（V{n} + 时间 + 来源标签）+ 选中状态（0/1/2 个）+ 关闭。
// 5.4 对比模式接入主区；5.5/5.6 回滚/导出按钮在对应子阶段启用（当前禁用占位）。
import { useEffect, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'

const SOURCE_LABEL = { save: '保存', auto: '自动保存', rollback: '回滚' }

function formatTime(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function VersionPanel({ relPath, editor, onCompareChange, onClose }) {
  const [versions, setVersions] = useState(null) // null = 加载中
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState([]) // 选中的版本号（0/1/2 个）
  // 用户定案：对比激活（选中版本）时面板向右滑出隐藏，避免遮挡 diff；取消选中自动恢复
  const [hidden, setHidden] = useState(false)
  const [confirmRollback, setConfirmRollback] = useState(false) // 回滚确认（5.5）
  const [reloadTick, setReloadTick] = useState(0) // 回滚/变更后刷新列表
  const [notice, setNotice] = useState(null) // 操作反馈（如导出成功路径，5.6）

  useEffect(() => {
    let alive = true
    window.mework.fs
      .versionList(relPath)
      .then((r) => alive && setVersions(r.versions))
      .catch((err) => alive && setError(String(err?.message ?? err)))
    return () => {
      alive = false
    }
  }, [relPath, reloadTick])

  // 5.4 选中变化 → 加载对比内容：选 1 对比「当前编辑内容 | 选中版」，选 2 对比两版本间（评审 O3）
  useEffect(() => {
    if (selected.length === 0) {
      onCompareChange(null)
      return
    }
    let cancelled = false
    async function load() {
      try {
        if (selected.length === 1) {
          const vid = selected[0]
          const r = await window.mework.fs.versionRead(relPath, vid)
          if (cancelled) return
          onCompareChange({
            left: editor.content ?? '',
            leftLabel: '当前编辑内容',
            right: r.content,
            rightLabel: `V${vid}`
          })
        } else {
          const [id1, id2] = selected
          const [r1, r2] = await Promise.all([
            window.mework.fs.versionRead(relPath, id1),
            window.mework.fs.versionRead(relPath, id2)
          ])
          if (cancelled) return
          onCompareChange({
            left: r1.content,
            leftLabel: `V${id1}`,
            right: r2.content,
            rightLabel: `V${id2}`
          })
        }
      } catch (err) {
        if (!cancelled) setError(String(err?.message ?? err))
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selected, relPath, editor.content, onCompareChange])

  // 对比激活（选中版本）→ 面板滑出隐藏；取消选中 → 面板恢复显示
  useEffect(() => {
    setHidden(selected.length > 0)
  }, [selected])

  // 面板卸载（关闭版本历史）时清对比，主区恢复「编辑 | 预览」
  useEffect(() => () => onCompareChange(null), [onCompareChange])

  /** 点选/取消版本；最多选 2 个，超出时替换较旧选中 */
  function toggleSelect(versionId) {
    setSelected((sel) => {
      if (sel.includes(versionId)) return sel.filter((id) => id !== versionId)
      if (sel.length >= 2) return [sel[1], versionId]
      return [...sel, versionId]
    })
  }

  /** 确认回滚（5.5）：恢复选中版本内容 + 强制落盘 + 记 rollback 版；刷新列表 */
  async function handleRollback() {
    const vid = selected[0]
    setConfirmRollback(false)
    const r = await editor.rollbackTo(vid)
    if (!r.ok) setError(r.error)
    setSelected([]) // 回滚后清选中，对比结束
    setReloadTick((t) => t + 1) // 列表出现新 rollback 版
  }

  /** 导出选中版本（5.6）：系统另存为默认 Documents，成功提示路径（5s 自动清除，评审 S2） */
  async function handleExport() {
    const vid = selected[0]
    try {
      const r = await window.mework.fs.versionExport(relPath, vid)
      if (!r.ok && !r.canceled) setError(r.error ?? '导出失败')
      else if (r.ok) {
        setNotice(`已导出：${r.path}`)
        setTimeout(() => setNotice(null), 5000)
      }
    } catch (err) {
      setError(String(err?.message ?? err)) // 兜底：IPC reject 不再静默（评审 P1）
    }
  }

  return (
    <>
      <div
        className={`version-panel${hidden ? ' version-panel--hidden' : ''}`}
        role="dialog"
        aria-label="版本历史"
      >
      <div className="version-panel__bar">
        <span className="version-panel__title" title={relPath}>
          版本历史
        </span>
        <button
          type="button"
          className="version-panel__close"
          onClick={onClose}
          aria-label="关闭"
          title="关闭"
        >
          ✕
        </button>
      </div>

      <div className="version-panel__body">
        {error && <p className="filetree__status filetree__status--error">{error}</p>}
        {!error && !versions && <p className="filetree__status">加载中…</p>}
        {!error && versions && versions.length === 0 && (
          <p className="filetree__status">暂无版本（保存后自动记录）</p>
        )}
        {!error && versions && versions.length > 0 && (
          <ul className="version-panel__list">
            {versions.map((v, i) => (
              <li key={v.versionId}>
                <button
                  type="button"
                  className={`version-panel__row${
                    selected.includes(v.versionId) ? ' version-panel__row--selected' : ''
                  }${i === 0 ? ' version-panel__row--current' : ''}`}
                  onClick={() => toggleSelect(v.versionId)}
                  title="点击选中（选 1 对比当前，选 2 对比版本间）"
                >
                  <span className="version-panel__id">V{v.versionId}</span>
                  <span className="version-panel__time">{formatTime(v.ts)}</span>
                  <span className="version-panel__source">{SOURCE_LABEL[v.editedBy] ?? v.editedBy}</span>
                  {i === 0 && <span className="version-panel__current">当前</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="version-panel__footer">
        <span className="version-panel__hint" title={notice ?? undefined}>
          {notice ??
            (selected.length === 0
              ? '点击版本选中：选 1 对比当前编辑内容，选 2 对比版本之间'
              : `已选 ${selected.length} 个版本`)}
        </span>
        <div className="version-panel__actions">
          {/* 5.5 回滚（选中 1 版可用）/ 5.6 导出（下一子阶段启用） */}
          <button
            type="button"
            className="confirm-dialog__btn"
            disabled={selected.length !== 1}
            title={selected.length === 1 ? '回滚到选中版本' : '选中 1 个版本后可回滚'}
            onClick={() => setConfirmRollback(true)}
          >
            回滚
          </button>
          <button
            type="button"
            className="confirm-dialog__btn"
            disabled={selected.length !== 1}
            title={selected.length === 1 ? '导出选中版本' : '选中 1 个版本后可导出'}
            onClick={handleExport}
          >
            导出
          </button>
        </div>
      </div>
      </div>

      {/* 对比激活时面板滑出，右缘留竖排唤出手柄 */}
      {hidden && (
        <button
          type="button"
          className="version-panel__tab"
          onClick={() => setHidden(false)}
          title="展开版本历史"
        >
          ◂ 版本
        </button>
      )}

      {/* 回滚确认（5.5，PRD §4.5.6） */}
      {confirmRollback && (
        <ConfirmDialog
          title="回滚版本"
          message="确定回滚到选中的版本？"
          warning="当前编辑内容将被该版本覆盖（未保存的修改会丢失）；回滚将生成一个新的 rollback 版本。"
          confirmLabel="回滚"
          onConfirm={handleRollback}
          onCancel={() => setConfirmRollback(false)}
        />
      )}
    </>
  )
}
