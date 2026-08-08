// 首次启动引导（PRD §4.1.1）—— 无工作区时的「暖纸书桌」空状态
// 整页暖纸底色与工作区冷灰外壳形成对比（样式确认 2026-08-09），
// 空状态 = 行动的邀请：标题 + 主操作 + 最近工作区（次级）。
import { useState } from 'react'

// 线性风格图标（PRD §3.4.4 类 SF Symbols，克制描边）
function WorkspaceIcon() {
  return (
    <svg
      className="onboarding__icon"
      width="56"
      height="56"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M8 12h8" />
      <path d="M8 15.5h5" />
    </svg>
  )
}

export default function Onboarding({ workspace }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  /** 打开系统目录选择 → 激活选中目录为工作区 */
  async function handleChoose() {
    setBusy(true)
    setError(null)
    try {
      const absPath = await window.mework.fs.chooseDirectory()
      if (!absPath) return // 用户取消
      const res = await workspace.activate(absPath)
      if (!res.ok) setError(res.error)
    } catch (err) {
      setError(String(err?.message ?? err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="onboarding">
      <div className="onboarding__inner">
        <WorkspaceIcon />

        <p className="onboarding__eyebrow">MEWORK</p>
        <h1 className="onboarding__title">选择你的工作区</h1>
        <p className="onboarding__desc">
          工作区是一个本地文件夹。你的笔记以 Markdown 真实落盘，
          可用任何编辑器打开，历史版本自动保留。
        </p>

        <button type="button" className="onboarding__cta" onClick={handleChoose} disabled={busy}>
          {busy ? '正在打开…' : '选择文件夹'}
        </button>

        {error && <p className="onboarding__error">{error}</p>}

        {workspace.recent.length > 0 && (
          <div className="onboarding__recent">
            <p className="onboarding__recent-label">最近使用</p>
            <div className="onboarding__recent-list">
              {workspace.recent.map((p) => (
                <div key={p} className="onboarding__recent-row">
                  <button
                    type="button"
                    className="onboarding__recent-item"
                    onClick={() => workspace.activate(p)}
                    title={p}
                  >
                    {p}
                  </button>
                  <button
                    type="button"
                    className="onboarding__recent-remove"
                    onClick={() => workspace.removeFromRecent(p)}
                    title="从最近列表移除"
                    aria-label={`移除 ${p}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
