import { useCallback, useEffect, useState } from 'react'

// 字体切换数据层（阶段 6.2，PRD §4.6.4）
// Inter / 系统默认 / 等宽 三选，仅 UI 字体（--font-ui 驱动，用户定案：编辑器保持等宽）。
// 持久化 localStorage（§4.6.5）；等宽模式汉字回退系统中文方案（PingFang SC / Microsoft YaHei）。
// UI 呈现于阶段 8 设置页，本阶段数据层 + 应用生效。

const STORAGE_KEY = 'mework.font'
const FONT_MODES = ['inter', 'system', 'mono']
const DEFAULT_FONT = 'system'

// 三种 UI 字体栈（等宽栈含汉字回退；Inter 依赖系统安装，缺失时回退系统）
export const FONT_STACKS = {
  inter: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`,
  system: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif`,
  mono: `'SF Mono', ui-monospace, 'Cascadia Code', Consolas, 'PingFang SC', 'Microsoft YaHei', monospace`
}

function readStored() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return FONT_MODES.includes(stored) ? stored : DEFAULT_FONT
  } catch {
    return DEFAULT_FONT
  }
}

export default function useFontSettings() {
  const [font, setFont] = useState(readStored)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, font)
    } catch {
      /* localStorage 不可用：静默降级，字体仅本次会话生效 */
    }
  }, [font])

  const setFontMode = useCallback((mode) => {
    setFont(FONT_MODES.includes(mode) ? mode : DEFAULT_FONT)
  }, [])

  return { font, setFontMode }
}
