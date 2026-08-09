import { useCallback, useEffect, useState } from 'react'

// 主题状态管理（PRD §4.6）
// 6.1 三态：light / dark / auto（跟随系统 prefers-color-scheme）。
// 规则（§4.6.2）：auto 时监听系统主题实时切换；手动选 light/dark 后不再自动跟随，除非切回 auto。
// 应用：生效主题写 <html data-theme>，CSS token 自动适配（§4.6.3）；模式持久化 localStorage（§4.6.5）。

const STORAGE_KEY = 'mework.theme'
const MODES = ['light', 'dark', 'auto']

function readStoredMode() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return MODES.includes(stored) ? stored : 'light'
  } catch {
    return 'light'
  }
}

function systemPrefersDark() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

export default function useTheme() {
  const [mode, setMode] = useState(readStoredMode)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  // 生效主题：auto 取系统，否则取手动选择
  const theme = mode === 'auto' ? (systemDark ? 'dark' : 'light') : mode

  // 监听系统主题变化（auto 模式下实时跟随）
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = (e) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // 应用生效主题 + 持久化模式
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      /* localStorage 不可用时静默降级：主题仅本次会话生效 */
    }
  }, [theme, mode])

  // 顶栏按钮：三态循环 light → dark → auto → light
  const cycleTheme = useCallback(() => {
    setMode((m) => (m === 'light' ? 'dark' : m === 'dark' ? 'auto' : 'light'))
  }, [])

  return { theme, mode, cycleTheme }
}
