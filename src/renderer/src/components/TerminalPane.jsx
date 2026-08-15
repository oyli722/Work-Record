// 终端面板（CC Console，设计文档 §3.3）
// xterm.js 挂载 + 与主进程 pty 双向数据流：term:data → terminal.write；terminal.onData → term:write。
// 常驻模型（D12）：TerminalPane 接收已创建的 termId（editorStore.openTerminalTab 经 term:create 取得），
// 由 EditorPane 常驻挂载——Tab 切走仅 visibility 隐藏（xterm 不卸载、缓冲与滚动不丢），
// 切回时经 active 触发 refit 恢复尺寸；卸载（关闭 Tab）时**不 kill**——终端进程生命周期 = Tab 生命周期，
// kill 归 confirmCloseTab / 应用退出（D11/D12）。
//
// CC-4 形态：
// - 占位态（termId 为 null，重启恢复）：显示「会话已随上次退出关闭」+「在此目录重新打开」按钮（§3.6）
// - 退出态（exited=true）：进程退出后显示「会话已结束（code=N）」+「重新打开」按钮（§3.5），xterm 卸载
// - 主题配色：终端固定深色（2026-08-15 用户定案——claude/Shell ANSI 按深色设计，浅底会相反）；
//   不再随 MeWork 明暗主题（theme prop 保留为扩展点，当前 xtermTheme() 恒为深色方案）
// - 字号跟随编辑器字号（2026-08-15 定案）
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

/** xterm 主题（2026-08-15 用户定案）：终端**固定深色**配色，不随 MeWork 亮/暗主题——
    claude/Shell 的 ANSI 配色按深色背景设计，浅底会「相反」；光标沿用 accent token。 */
function xtermTheme() {
  return {
    background: '#1e1e1e', // 固定深色（VS Code 默认终端底色同款）
    foreground: '#d4d4d4', // 固定浅色前景
    cursor: '#0a84ff',
    selectionBackground: '#3a3a3c'
  }
}

export default function TerminalPane({
  termId = null,
  title = '终端',
  cwdRelPath = '.',
  fontSize = 13,
  active = true,
  theme = 'dark',
  exited = false,
  exitCode = null,
  onExit,
  onReopen
}) {
  // 重启恢复占位（termId 为 null，进程已随上次退出关闭）：提供「在此目录重新打开」（§3.6）
  if (!termId) {
    return (
      <div className="terminal terminal--placeholder">
        <p className="terminal__placeholder-title">终端会话已随上次退出关闭</p>
        <p className="terminal__placeholder-hint">
          {title}（{cwdRelPath}）
        </p>
        <button type="button" className="terminal__reopen" onClick={onReopen}>
          在此目录重新打开
        </button>
      </div>
    )
  }

  // 退出占位（进程已结束）：显示退出码 + 「重新打开」（§3.5）；xterm 随之卸载
  if (exited) {
    return (
      <div className="terminal terminal--placeholder">
        <p className="terminal__placeholder-title">会话已结束</p>
        <p className="terminal__placeholder-hint">
          {title}（{cwdRelPath}）— 退出码 {exitCode ?? '未知'}
        </p>
        <button type="button" className="terminal__reopen" onClick={onReopen}>
          重新打开
        </button>
      </div>
    )
  }

  return (
    <LiveTerminal
      termId={termId}
      title={title}
      fontSize={fontSize}
      active={active}
      theme={theme}
      onExit={onExit}
    />
  )
}

/** 实时终端：常驻绑定 termId 数据流（EditorPane 挂载期间不卸载，缓冲保留） */
function LiveTerminal({ termId, fontSize, active, theme, onExit }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const fitRef = useRef(null)

  // 挂载：创建 xterm + fit + 数据流 + 尺寸同步（含 CC-3 缺陷修复，见文件头注释）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const term = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: xtermTheme()
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    termRef.current = term

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

    // 主进程 → 终端：pty 输出写入（按 termId 过滤；隐藏时组件仍挂载，输出照写缓冲）
    const offData = window.mework.term.onData((id, chunk) => {
      if (id === termId) term.write(chunk)
    })
    // 主进程 → 终端：进程退出（CC-4 起落退出占位态：通知 store 标记 exited → 本组件重渲染为占位）
    const offExit = window.mework.term.onExit((id, code) => {
      if (id === termId) onExit?.(code)
    })
    // 终端 → 主进程：键盘输入直达 pty
    const dataDisposable = term.onData((data) => {
      window.mework.term.write(termId, data)
    })

    term.focus()

    return () => {
      disposed = true
      stopClamp()
      termRef.current = null
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
  }, [termId, fontSize]) // eslint-disable-line react-hooks/exhaustive-deps -- onExit 经闭包由 EditorPane 每渲染更新，见 EditorPane 传参

  // 主题扩展点：当前固定深色（用户定案），theme 变化时重应用 xtermTheme()（恒为深色方案，
  // 保留此 effect 以便未来支持终端配色可配置时直接接入）
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = xtermTheme()
  }, [theme])

  // CC-4 字号跟随编辑器字号：更新字号 → 重新测量字符 + fit + 同步 pty
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontSize = fontSize
    try {
      fitRef.current?.fit()
    } catch {
      /* 忽略 */
    }
    window.mework.term.resize(termId, term.cols, term.rows)
  }, [fontSize, termId])

  // 激活变化（切回）：容器从 visibility 隐藏恢复实际尺寸后 refit。
  // 多重时序兜底（visibility 恢复 → 布局稳定 → 渲染服务/字符测量就绪）：
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
          const term = termRef.current
          if (term) window.mework.term.resize(termId, term.cols, term.rows)
        }
      }, t)
    )
    return () => timers.forEach((t) => clearTimeout(t))
  }, [active, termId])

  return <div className="terminal" ref={containerRef} />
}
