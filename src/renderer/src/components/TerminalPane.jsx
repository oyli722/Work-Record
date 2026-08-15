// 终端面板（CC Console，设计文档 §3.3）
// xterm.js 挂载 + 与主进程 pty 双向数据流：term:data → terminal.write；terminal.onData → term:write。
// 常驻模型（D12）：TerminalPane 接收已创建的 termId（editorStore.openTerminalTab 经 term:create 取得），
// 由 EditorPane 常驻挂载——Tab 切走仅 display:none 隐藏（xterm 不卸载、缓冲与滚动不丢），
// 切回时经 active 触发 refit 恢复尺寸；卸载（关闭 Tab）时**不 kill**——终端进程生命周期 = Tab 生命周期，
// kill 归 confirmCloseTab / 应用退出（D11/D12）。
// termId 为 null 时渲染占位态（设计 §3.6 重启恢复：会话已随上次退出关闭；重开按钮 CC-4 落地）。
// 主题跟随 / 退出占位态在 CC-4 完善，本组件已打通常驻缓冲与 Tab 生命周期驱动。

import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export default function TerminalPane({ termId = null, title = '终端', cwdRelPath = '.', fontSize = 13, active = true }) {
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

  return <LiveTerminal termId={termId} title={title} fontSize={fontSize} active={active} />
}

/** 实时终端：常驻绑定 termId 数据流（EditorPane 挂载期间不卸载，缓冲保留） */
function LiveTerminal({ termId, fontSize, active }) {
  const containerRef = useRef(null)
  const fitRef = useRef(null)

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
    fitRef.current = fit

    // 容器尺寸变化 → 重新 fit（终端跟随主内容区大小，避免 xterm-screen 停留在初始尺寸）
    const fitObserver = new ResizeObserver(() => fit.fit())
    fitObserver.observe(container)

    // 主进程 → 终端：pty 输出写入（按 termId 过滤；display:none 时组件仍挂载，输出照写缓冲）
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
      fitRef.current = null
      fitObserver.disconnect()
      offData()
      offExit()
      dataDisposable.dispose()
      resizeDisposable.dispose()
      term.dispose()
      // 不 kill：进程生命周期 = Tab 生命周期，kill 归 confirmCloseTab / 应用退出（D11/D12）
    }
  }, [termId, fontSize])

  // 激活变化（切回）：容器从 display:none 恢复实际尺寸后 refit。
  // 多重时序兜底（display 恢复 → 布局稳定 → 渲染服务/字符测量就绪）：
  // 单次 fit 若在过渡态执行会拿到偏小的容器宽度，导致 cols 偏小、内容左移 + 右侧空白。
  useEffect(() => {
    if (!active) return
    const timers = [0, 60, 250].map((t) =>
      setTimeout(() => {
        // 容器已有实际尺寸时才 fit（避免在 0 尺寸过渡态误算）
        if (containerRef.current?.clientWidth > 0 && containerRef.current?.clientHeight > 0) {
          fitRef.current?.fit()
        }
      }, t)
    )
    return () => timers.forEach((t) => clearTimeout(t))
  }, [active])

  return <div className="terminal" ref={containerRef} />
}
