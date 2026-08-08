// 首次启动引导（PRD §4.1.1）
// 无工作区时展示：说明 + 「选择文件夹」主操作 + 最近工作区恢复入口。
// 选择目录走主进程 fs:choose_directory（原生对话框），成功后 activate。
import { useState } from 'react'

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
      <div className="onboarding__card">
        <h1 className="onboarding__title">MeWork</h1>
        <p className="onboarding__desc">
          选择一个本地文件夹作为工作区。文件真实落盘，可用其他编辑器直接打开；
          你的记录始终保存在自己选的文件夹里。
        </p>

        <button type="button" className="onboarding__cta" onClick={handleChoose} disabled={busy}>
          {busy ? '正在打开…' : '选择工作区文件夹'}
        </button>

        {error && <p className="onboarding__error">{error}</p>}

        {workspace.recent.length > 0 && (
          <div className="onboarding__recent">
            <p className="onboarding__recent-label">最近使用</p>
            <ul className="onboarding__recent-list">
              {workspace.recent.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    className="onboarding__recent-item"
                    onClick={() => workspace.activate(p)}
                    title={p}
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
