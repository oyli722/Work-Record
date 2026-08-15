// 终端面板（CC Console，设计文档 §3.3）
// xterm.js 挂载 + 与主进程 pty 双向数据流：term:data → terminal.write；terminal.onData → term:write。
// 常驻模型（D12）：TerminalPane 接收已创建的 termId（editorStore.openTerminalTab 经 term:create 取得），
// 由 EditorPane 常驻挂载——Tab 切走仅 display:none 隐藏（xterm 不卸载、缓冲与滚动不丢），
// 切回时经 active 触发 refit 恢复尺寸；卸载（关闭 Tab）时**不 kill**——终端进程生命周期 = Tab 生命周期，
// kill 归 confirmCloseTab / 应用退出（D11/D12）。
// termId 为 null 时渲染占位态（设计 §3.6 重启恢复：会话已随上次退出关闭；重开按钮 CC-4 落地）。
// 主题跟随 / 退出占位态在 CC-4 完善，本组件已打通常驻缓冲与 Tab 生命周期驱动。
//
// CC-3 缺陷修复记录（2026-08-15，详见《docs/CC终端集成-CC3布局缺陷排查记录.md》）：
// - 缺陷一（非专注终端只占 60-70% 宽）：onResize 订阅必须先于首次 fit，否则初次 fit 的
//   resize 事件丢失 → pty 停留 spawn 初始 80×24 → claude 按 80 列渲染；另加 fit 后兜底
//   syncSize 主动同步、document.fonts.ready 后重新 fit（防字符测量未就绪时 fit 静默失败）。
// - 缺陷二（组合输入长文字终端左移 + 右侧留白 + IME 卡顿）：组合期间钳制 textarea /
//   composition-view 宽度 ≤ 视口右缘 - 左缘，消除「textarea 超出视口」触发条件。

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

    // 【CC-3 缺陷一修复】尺寸同步订阅必须先于首次 fit：初次 fit（默认 80 列 → 实际 cols）触发的
    // onResize 事件若丢失（订阅在后），pty 将停留在 spawn 初始 80×24 → claude 按 80 列渲染
    // TUI → 内容只占容器 60-70% 宽度。
    let disposed = false
    const syncSize = () => {
      if (!disposed && termId) window.mework.term.resize(termId, term.cols, term.rows)
    }
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      window.mework.term.resize(termId, cols, rows)
    })

    /** fit + 兜底同步：onResize 仅在 cols/rows 变化时触发，主动同步一次保证 pty 尺寸一致 */
    const doFit = () => {
      try {
        fit.fit()
      } catch {
        // fit 静默失败（字符尺寸未就绪等）：保留现状，等待 fonts.ready / ResizeObserver 重试
      }
      syncSize()
      return { cols: term.cols, rows: term.rows }
    }

    doFit()

    // 【CC-3 缺陷一修复】字体就绪兜底：若打开终端时字体尚未加载完成，xterm 字符测量可能异常
    // （cell.width=0）→ fit 静默失败 → 终端保持默认 80 列；字体就绪后重新 fit + 同步。
    const fontsReady = document.fonts?.ready
      ? document.fonts.ready.then(() => {
          if (!disposed) doFit()
        })
      : null
    if (fontsReady) fontsReady.catch(() => {})
    fitRef.current = fit

    // 容器尺寸变化 → 重新 fit（终端跟随主内容区大小，避免 xterm-screen 停留在初始尺寸）
    const fitObserver = new ResizeObserver(() => doFit())
    fitObserver.observe(container)

    // 【CC-3 缺陷二修复】组合输入钳制：xterm 把 textarea 宽度设为组合文字宽，光标靠右时右缘
    // 超出视口 → 浏览器对聚焦 textarea 的滚动处理使终端内容平移（左移+右侧留白，随未上屏文字
    // 长度变化），长组合文字还会搅乱 IME 组合状态（输入法无响应）。组合期间每帧钳制 textarea
    // 宽度 ≤ 视口右缘 - 左缘，从源头消除「超出视口」这一触发条件（textarea 透明，钳制无视觉影响）。
    let clampRaf = 0
    const clampTextarea = () => {
      if (disposed) return
      const vp = container.querySelector('.xterm-viewport')
      const ta = container.querySelector('.xterm-helper-textarea')
      const cv = container.querySelector('.composition-view')
      if (vp && ta && ta.offsetWidth > 0) {
        const vpRect = vp.getBoundingClientRect()
        const taRect = ta.getBoundingClientRect()
        const maxW = Math.floor(vpRect.right - taRect.left) - 1 // 留 1px 余量防浮点边界
        if (maxW > 0) {
          // composition-view 宽度钳制是主手段：xterm 每帧以它的 getBoundingClientRect 宽度
          // 设置 textarea 宽度，钳制它后 textarea 宽度天然一致（无对抗抖动）；组合文字超出
          // 部分仍溢出显示（nowrap + overflow visible），视觉完整。
          if (cv && cv.offsetWidth > maxW) cv.style.width = `${maxW}px`
          if (ta.offsetWidth > maxW) ta.style.width = `${maxW}px` // 兜底
        }
      }
      clampRaf = requestAnimationFrame(clampTextarea)
    }
    const stopClamp = () => {
      if (clampRaf) {
        cancelAnimationFrame(clampRaf)
        clampRaf = 0
      }
    }
    const onComposition = (e) => {
      if (e.type === 'compositionstart' || e.type === 'compositionupdate') {
        if (!clampRaf) clampRaf = requestAnimationFrame(clampTextarea)
      } else if (e.type === 'compositionend') {
        stopClamp()
      }
    }
    container.addEventListener('compositionstart', onComposition)
    container.addEventListener('compositionupdate', onComposition)
    container.addEventListener('compositionend', onComposition)

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

    term.focus()

    return () => {
      disposed = true
      stopClamp()
      fitRef.current = null
      fitObserver.disconnect()
      container.removeEventListener('compositionstart', onComposition)
      container.removeEventListener('compositionupdate', onComposition)
      container.removeEventListener('compositionend', onComposition)
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
          try {
            fitRef.current?.fit()
          } catch {
            /* 忽略：等待下一时序 */
          }
          // 兜底同步：fit 后 pty 尺寸与 xterm 一致（切回时容器尺寸可能已变化）
          const term = fitRef.current?._terminal ?? null
          if (term) window.mework.term.resize(termId, term.cols, term.rows)
        }
      }, t)
    )
    return () => timers.forEach((t) => clearTimeout(t))
  }, [active, termId])

  return <div className="terminal" ref={containerRef} />
}
