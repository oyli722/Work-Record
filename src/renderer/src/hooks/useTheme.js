import { useCallback, useEffect, useState } from 'react'

// 主题状态管理（PRD §4.6）
// 本阶段：浅色 / 深色两套 + 手动切换，偏好持久化于 localStorage（4.6.5）。
// 阶段 6 扩展：跟随系统（prefers-color-scheme）+ 手动覆盖规则（4.6.2）。
// 主题以 <html data-theme="…"> 驱动，CSS 变量 token 自动适配（4.6.3）。

const STORAGE_KEY = 'mework.theme'

function readStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export default function useTheme() {
  const [theme, setTheme] = useState(() => {
    const stored = readStoredTheme()
    return stored === 'dark' || stored === 'light' ? stored : 'light'
  })

  // 将主题写入 <html> 的 data-theme 属性（CSS token 切换的驱动点）
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* localStorage 不可用时静默降级：主题仅本次会话生效 */
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }, [])

  return { theme, toggleTheme }
}
