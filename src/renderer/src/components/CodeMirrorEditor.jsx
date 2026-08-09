// CodeMirror 6 受控编辑器组件（阶段 3.2 / 3.7）
// 替换 3.1 的 textarea 占位：MD 语法高亮 + 浅/深主题动态切换 + 受控内容同步。
// 受控约定：
//   - 外部 value 变化（openFile 加载 / close）→ dispatch 替换全文
//   - 用户编辑 → updateListener 回调 onChange，由 editorStore 统一维护
// 主题：themeComp 用 Compartment 动态 reconfigure（light 默认 / dark oneDark），
// 避免重建 EditorView。暖纸阅读面底色由 CSS 覆盖（见 index.css .codemirror）。
// 3.7 分屏同步滚动（PRD §4.2.6）：经 forwardRef 暴露 scrollToLine（滚动到指定源行），
// 滚动监听上报顶部可见行 onTopLineChange；programmatic 滚动期抑制上报防回环。
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { Compartment } from '@codemirror/state'

const CodeMirrorEditor = forwardRef(function CodeMirrorEditor(
  { value, onChange, theme, onTopLineChange },
  ref
) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)
  const themeCompRef = useRef(null)
  // ref 镜像最新回调：供滚动监听（useEffect 仅创建一次）在稳定闭包下读到最新值
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onTopLineChangeRef = useRef(onTopLineChange)
  onTopLineChangeRef.current = onTopLineChange
  // programmatic 滚动抑制：外部驱动滚动期间不上报（防双向联动回环）
  const progRef = useRef(false)
  const progTimerRef = useRef(0)

  // 暴露给父级：滚动到指定源行（clamp 到文档内；顶部对齐）
  useImperativeHandle(
    ref,
    () => ({
      scrollToLine(line) {
        const view = viewRef.current
        if (!view || line < 1) return
        const pos = view.state.doc.line(Math.min(line, view.state.doc.lines)).from
        progRef.current = true
        clearTimeout(progTimerRef.current)
        progTimerRef.current = setTimeout(() => {
          progRef.current = false
        }, 60) // 滚动停稳后恢复上报
        view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start' }) })
      }
    }),
    []
  )

  // 创建一次 EditorView
  useEffect(() => {
    const themeComp = new Compartment()
    themeCompRef.current = themeComp
    const view = new EditorView({
      doc: value,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping, // 软换行：长行（含 MD 长段落）自动换行，避免水平滚动
        themeComp.of(theme === 'dark' ? oneDark : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
        })
      ],
      parent: containerRef.current
    })
    viewRef.current = view

    // 3.7：滚动监听 → 上报顶部可见行（lineBlockAtHeight 取视口顶行块 → 源行号）
    const onScroll = () => {
      if (progRef.current) return
      const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop)
      const line = view.state.doc.lineAt(block.from).number
      onTopLineChangeRef.current?.(line) // 父级未接联动时安全跳过（?.）
    }
    view.scrollDOM.addEventListener('scroll', onScroll)

    view.focus()
    return () => {
      view.scrollDOM.removeEventListener('scroll', onScroll)
      clearTimeout(progTimerRef.current)
      view.destroy()
      viewRef.current = null
      themeCompRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部 value 变化同步（自身编辑触发的 value 变化 cur === value，跳过避免环）
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const cur = view.state.doc.toString()
    if (cur !== value) {
      view.dispatch({ changes: { from: 0, to: cur.length, insert: value } })
    }
  }, [value])

  // 主题切换动态重配置
  useEffect(() => {
    const view = viewRef.current
    const comp = themeCompRef.current
    if (!view || !comp) return
    view.dispatch({ effects: comp.reconfigure(theme === 'dark' ? oneDark : []) })
  }, [theme])

  return <div ref={containerRef} className="codemirror" />
})

export default CodeMirrorEditor
