// 终端面板（CC Console，设计文档 §3.3）
// xterm.js 挂载 + 与主进程 pty 双向数据流：term:data → terminal.write；terminal.onData → term:write。
// CC-1 自包含验证版：挂载即 term:create、卸载即 term:kill；CC-4 起由 Tab 生命周期驱动。
// 主题跟随 / 退出占位态 / 切换缓冲等在 CC-4 落地，本组件仅打通 dev 双链路。
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export default function TerminalPane({ cwdRelPath = '.', fontSize = 13 }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const term = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: { background: '#1e1e1e', foreground: '#d4d4d4' } // CC-4 起跟随 MeWork 主题 token
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()

    let termId = null
    let disposed = false

    // 主进程 → 终端：pty 输出写入
    const offData = window.mework.term.onData((id, chunk) => {
      if (id === termId) term.write(chunk)
    })
    // 主进程 → 终端：进程退出（CC-1 仅提示；CC-4 起落退出占位态）
    const offExit = window.mework.term.onExit((id, code) => {
      if (id === termId) term.write(`\r\n\x1b[90m[进程已退出，code=${code}]\x1b[0m\r\n`)
    })
    // 终端 → 主进程：键盘输入直达 pty
    const dataDisposable = term.onData((data) => {
      if (termId) window.mework.term.write(termId, data)
    })
    // 尺寸同步：fit 后 cols/rows 变化回传 pty
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      if (termId) window.mework.term.resize(termId, cols, rows)
    })

    // 创建终端会话（CC-1：cwd 固定工作区根；CC-5 起由右键菜单目录驱动）
    ;(async () => {
      const r = await window.mework.term.create(cwdRelPath)
      if (disposed) {
        if (r.ok) window.mework.term.kill(r.termId)
        return
      }
      if (r.ok) {
        termId = r.termId
        term.focus()
      } else {
        term.write(`\r\n\x1b[31m[终端启动失败：${r.reason}]\x1b[0m\r\n`)
      }
    })()

    return () => {
      disposed = true
      offData()
      offExit()
      dataDisposable.dispose()
      resizeDisposable.dispose()
      if (termId) window.mework.term.kill(termId)
      term.dispose()
    }
  }, [cwdRelPath, fontSize])

  return <div className="terminal" ref={containerRef} />
}
