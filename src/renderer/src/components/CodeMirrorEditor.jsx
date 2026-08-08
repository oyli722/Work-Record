// CodeMirror 6 受控编辑器组件（阶段 3.2）
// 替换 3.1 的 textarea 占位：MD 语法高亮 + 浅/深主题动态切换 + 受控内容同步。
// 受控约定：
//   - 外部 value 变化（openFile 加载 / close）→ dispatch 替换全文
//   - 用户编辑 → updateListener 回调 onChange，由 editorStore 统一维护
// 主题：themeComp 用 Compartment 动态 reconfigure（light 默认 / dark oneDark），
// 避免重建 EditorView。暖纸阅读面底色由 CSS 覆盖（见 index.css .codemirror）。
import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { Compartment } from '@codemirror/state'

export default function CodeMirrorEditor({ value, onChange, theme }) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)
  const themeCompRef = useRef(null)
  // 始终持有最新 onChange，避免扩展数组因回调引用变化而重建
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

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
    view.focus()
    return () => {
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
}
