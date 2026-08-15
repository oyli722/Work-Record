import { useCallback, useEffect, useState } from 'react'

// 编辑器设置数据层（阶段 3.9，PRD §4.8.4 / §2.8；CC-5 加 AI 组终端入口开关，设计 §3.8）
// 设置项：自动保存开关、防抖间隔（默认 30s，v1.3 定案）、编辑器字号；
// CC-5：terminalMenuEnabled「右键打开 Claude Code 终端」开关（默认关，D1）。
// 持久化于 localStorage（UI 偏好走渲染进程 localStorage，PRD §2.8），仿 useTheme 模式：
// 读取带默认值 + 非法值回退，写入 try/catch 静默降级（localStorage 不可用时会话内生效）。
// 设置页 UI 在阶段 8 呈现；本阶段数据层生效（字号应用到编辑区、开关/间隔驱动自动保存）。

const STORAGE_KEY = 'mework.editorSettings'
const DEFAULT_SETTINGS = {
  autosaveEnabled: true,
  autosaveDelayMs: 30000,
  fontSize: 14,
  terminalMenuEnabled: false
}
const FONT_MIN = 12
const FONT_MAX = 20
const DELAY_MIN_MS = 1000
const DELAY_MAX_MS = 600000 // 10 分钟（评审 S2：setTimeout 有上限，防超大值异常）

/** 清洗存储值：字段缺失/非法回退默认；字号 clamp [12, 20]、间隔 clamp [1s, 10min] 并取整 */
function sanitize(value) {
  const v = { ...DEFAULT_SETTINGS }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (typeof value.autosaveEnabled === 'boolean') v.autosaveEnabled = value.autosaveEnabled
    const delay = Number(value.autosaveDelayMs)
    if (Number.isFinite(delay)) {
      v.autosaveDelayMs = Math.min(DELAY_MAX_MS, Math.max(DELAY_MIN_MS, Math.round(delay)))
    }
    const size = Number(value.fontSize)
    if (Number.isFinite(size)) {
      v.fontSize = Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(size)))
    }
    if (typeof value.terminalMenuEnabled === 'boolean') v.terminalMenuEnabled = value.terminalMenuEnabled
  }
  return v
}

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? sanitize(JSON.parse(raw)) : { ...DEFAULT_SETTINGS }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export default function useEditorSettings() {
  const [settings, setSettings] = useState(readStored)

  // 设置变化即持久化
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      /* localStorage 不可用：静默降级，设置仅本次会话生效 */
    }
  }, [settings])

  const setAutosaveEnabled = useCallback((enabled) => {
    setSettings((s) => ({ ...s, autosaveEnabled: Boolean(enabled) }))
  }, [])

  const setAutosaveDelayMs = useCallback((ms) => {
    setSettings((s) => {
      const v = Number(ms)
      if (!Number.isFinite(v)) return s
      return {
        ...s,
        autosaveDelayMs: Math.min(DELAY_MAX_MS, Math.max(DELAY_MIN_MS, Math.round(v)))
      }
    })
  }, [])

  const setFontSize = useCallback((px) => {
    setSettings((s) => {
      const v = Number(px)
      if (!Number.isFinite(v)) return s
      return { ...s, fontSize: Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(v))) }
    })
  }, [])

  // CC-5 终端右键入口开关（设计 D1，默认关）
  const setTerminalMenuEnabled = useCallback((enabled) => {
    setSettings((s) => ({ ...s, terminalMenuEnabled: Boolean(enabled) }))
  }, [])

  return { settings, setAutosaveEnabled, setAutosaveDelayMs, setFontSize, setTerminalMenuEnabled }
}
