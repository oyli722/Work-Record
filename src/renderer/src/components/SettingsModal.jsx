// 设置弹窗（阶段 8.1，PRD §4.8）：左侧分组导航 + 右侧设置项
// 外观：主题三态（浅/深/跟随系统）+ 字体三选（Inter/系统/等宽）
// 编辑器：自动保存开关 / 防抖间隔 / 字号；工作区：当前路径 + 更换；
// AI：灰色预留「将在未来版本中提供」；关于：产品信息。
import { useState } from 'react'

const GROUPS = [
  { id: 'appearance', label: '外观' },
  { id: 'editor', label: '编辑器' },
  { id: 'workspace', label: '工作区' },
  { id: 'ai', label: 'AI' },
  { id: 'about', label: '关于' }
]

export default function SettingsModal({
  themeMode,
  setThemeMode,
  font,
  setFontMode,
  editorSettings,
  setAutosaveEnabled,
  setAutosaveDelayMs,
  setFontSize,
  workspace,
  editor,
  onClose
}) {
  const [group, setGroup] = useState('appearance')

  const radio = (name, value, current, onChange, label) => (
    <label key={value} className="settings__radio">
      <input type="radio" name={name} checked={current === value} onChange={() => onChange(value)} />
      <span>{label}</span>
    </label>
  )

  /** 更换工作区（8.1）：先保存全部未保存标签，再切换并清空标签 */
  async function handleChangeWorkspace() {
    const absPath = await window.mework.fs.chooseDirectory()
    if (!absPath) return
    await editor.saveAll() // 保存未保存标签，避免切换丢数据
    await workspace.deactivate()
    const res = await workspace.activate(absPath)
    editor.close()
    if (res.ok) onClose() // 切换成功关闭设置
  }

  return (
    <div
      className="settings__mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="settings" role="dialog" aria-modal="true">
        <div className="settings__bar">
          <span className="settings__title">设置</span>
          <button type="button" className="settings__close" onClick={onClose} aria-label="关闭" title="关闭">
            ✕
          </button>
        </div>
        <div className="settings__body">
          <nav className="settings__nav">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`settings__nav-item${group === g.id ? ' settings__nav-item--active' : ''}`}
                onClick={() => setGroup(g.id)}
              >
                {g.label}
              </button>
            ))}
          </nav>
          <div className="settings__content">
            {group === 'appearance' && (
              <>
                <h4 className="settings__h4">主题</h4>
                <div className="settings__row">
                  {radio('theme', 'light', themeMode, setThemeMode, '浅色')}
                  {radio('theme', 'dark', themeMode, setThemeMode, '深色')}
                  {radio('theme', 'auto', themeMode, setThemeMode, '跟随系统')}
                </div>
                <h4 className="settings__h4">字体（仅界面）</h4>
                <div className="settings__row">
                  {radio('font', 'system', font, setFontMode, '系统默认')}
                  {radio('font', 'inter', font, setFontMode, 'Inter')}
                  {radio('font', 'mono', font, setFontMode, '等宽')}
                </div>
              </>
            )}
            {group === 'editor' && (
              <>
                <h4 className="settings__h4">自动保存</h4>
                <label className="settings__toggle">
                  <input
                    type="checkbox"
                    checked={editorSettings.autosaveEnabled}
                    onChange={(e) => setAutosaveEnabled(e.target.checked)}
                  />
                  <span>启用自动保存（停止编辑约 N 秒后落盘）</span>
                </label>
                <h4 className="settings__h4">保存防抖间隔（秒）</h4>
                <input
                  type="number"
                  className="settings__input"
                  min={1}
                  max={600}
                  value={Math.round(editorSettings.autosaveDelayMs / 1000)}
                  onChange={(e) => setAutosaveDelayMs(Number(e.target.value) * 1000)}
                />
                <h4 className="settings__h4">编辑器字号（px）</h4>
                <input
                  type="number"
                  className="settings__input"
                  min={12}
                  max={20}
                  value={editorSettings.fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                />
              </>
            )}
            {group === 'workspace' && (
              <>
                <h4 className="settings__h4">当前工作区</h4>
                <p className="settings__path" title={workspace.activePath ?? ''}>
                  {workspace.activePath ?? '未选择'}
                </p>
                <button
                  type="button"
                  className="confirm-dialog__btn"
                  onClick={handleChangeWorkspace}
                >
                  更换工作区…
                </button>
              </>
            )}
            {group === 'ai' && (
              <p className="settings__disabled">AI 功能将在未来版本中提供。</p>
            )}
            {group === 'about' && (
              <>
                <p className="settings__about-name">MeWork</p>
                <p className="settings__about-line">版本 v1.0.0-mvp</p>
                <p className="settings__about-line">本地工作记录管理桌面应用</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
