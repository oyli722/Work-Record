// 终端面板（CC Console，设计文档 §3.3）
// xterm.js 挂载 + 与主进程 pty 双向数据流：term:data → terminal.write；terminal.onData → term:write。
// CC-3 过渡版：TerminalPane 接收已创建的 termId（termId 由 editorStore.openTerminalTab 经 term:create 取得），
// 挂载时绑定该 termId 数据流，卸载时**不 kill**——终端进程生命周期 = Tab 生命周期（D12 方向：
// Tab 切走 xterm 重挂载重绑定、进程持续；滚动缓冲保留等精化在 CC-4 落地）。
// termId 为 null 时渲染占位态（设计 §3.6 重启恢复：会话已随上次退出关闭；重开按钮 CC-4 落地）。
// 主题跟随 / 退出占位态 / 切换缓冲在 CC-4 完善，本组件先打通 Tab 生命周期驱动的数据流。

import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export default function TerminalPane({ termId = null, title = '终端', cwdRelPath = '.', fontSize = 13 }) {
  const containerRef = useRef(null)

  // 占位态：termId 为 null（重启恢复的 terminal tab，进程已随上次退出关闭）
  if (!termId) {
    return (
      <div className="terminal terminal--placeholder">
        <p className="terminal__placeholder-title">终端会话已随上次退出关闭</p>
        <p className="terminal__placeholder-hint">
          {title}（{cwdRelPath}）— 重新打开终端按钮将在后续版本提供
        </p>
      </div>
    )
  }

  return <LiveTerminal termId={termId} title={title} fontSize={fontSize} containerRef={containerRef} />
}

/** 实时终端：绑定已存在 termId 的数据流（xterm 每次挂载重建，CC-4 精化为常驻缓冲） */
function LiveTerminal({ termId, fontSize }) {
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

    // 容器尺寸变化 → 重新 fit（终端跟随主内容区大小，避免 xterm-screen 停留在初始尺寸）
    const fitObserver = new ResizeObserver(() => fit.fit())
    fitObserver.observe(container)

    // 主进程 → 终端：pty 输出写入（按 termId 过滤）
    const offData = window.mework.term.onData((id, chunk) => {
      if (id === termId) term.write(chunk)
    })
    // 主进程 → 终端：进程退出（CC-3 仅提示；CC-4 起落退出占位态）
    const offExit = window.mework.term.onExit((id, code) => {
      if (id === termId) term.write(`\r\n\x1b[90m[进程已退出，code=${code}]\x1b[0m\r\n`)
    })
    // 终端 → 主进程：键盘输入直达 pty
    const dataDisposable = term.onData((data) => {
      window.mework.term.write(termId, data)
    })
    // 尺寸同步：fit 后 cols/rows 变化回传 pty
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      window.mework.term.resize(termId, cols, rows)
    })

    term.focus()

    return () => {
      fitObserver.disconnect()
      offData()
      offExit()
      dataDisposable.dispose()
      resizeDisposable.dispose()
      term.dispose()
      // 不 kill：进程生命周期 = Tab 生命周期，kill 归 confirmCloseTab / 应用退出（D12）
    }
  }, [termId, fontSize])

  return <div className="terminal" ref={containerRef} />
}
