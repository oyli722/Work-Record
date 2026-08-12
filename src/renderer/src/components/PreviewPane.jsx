// 预览区（阶段 3.4/3.5/3.6/3.7：markdown-it + DOMPurify 渲染，暖纸阅读面）
// isMarkdown=false（TXT）退化为纯文本 pre 呈现。
// 相对图片经 baseDir 解析为 mework-file://（3.5）；外链点击 → 系统浏览器/默认程序（3.6）。
// 协议白名单单一来源 src/shared/link-policy.js（评审 S3），主进程同引用。
// 3.7 分屏同步滚动（PRD §4.2.6）：经 forwardRef 暴露 scrollToLine，滚动上报顶部可见行
// onTopLineChange；MD 按 data-src-line 锚点对齐，TXT 按百分比对齐；programmatic 抑制防回环。
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { renderMarkdown } from '../utils/markdown'
import { isExternalLink } from '../../../shared/link-policy'

const PreviewPane = forwardRef(function PreviewPane(
  { content, isMarkdown, baseDir, onTopLineChange },
  ref
) {
  const html = useMemo(
    () => (isMarkdown ? renderMarkdown(content, baseDir) : ''),
    [content, isMarkdown, baseDir]
  )
  const scrollRef = useRef(null)
  const onTopLineChangeRef = useRef(onTopLineChange)
  onTopLineChangeRef.current = onTopLineChange
  const anchorsRef = useRef([]) // MD 锚点缓存 [{srcLine, top, bottom}]，文档序、行号递增
  const progRef = useRef(false) // programmatic 滚动抑制（防双向联动回环）
  const progTimerRef = useRef(0)
  // 9.2.7 待定滚动行：scrollToLine 请求后若锚点尚旧/容器隐藏（编辑中内容未渲染、或
  // 三态切换隐藏），暂存此行；锚点重建（内容变化）或显示后再重新对齐，保证最终落位。
  const pendingScrollLineRef = useRef(null)

  // 9.2.7 实际滚动实现（scrollToLine 与锚点重建后重放共用）。顶部对齐到目标行锚点。
  const applyScrollToLine = useCallback(
    (line) => {
      const el = scrollRef.current
      if (!el || line < 1 || el.clientHeight === 0) return false // 隐藏中不滚动（锚点无意义）
      progRef.current = true
      clearTimeout(progTimerRef.current)
      progTimerRef.current = setTimeout(() => {
        progRef.current = false
      }, 60) // 滚动停稳后恢复上报
      if (isMarkdown) {
        const anchors = anchorsRef.current
        if (!anchors || anchors.length === 0) return false // 锚点未建：留待重建后重放
        let lo = 0
        let hi = anchors.length
        while (lo < hi) {
          const mid = (lo + hi) >> 1
          if (anchors[mid].srcLine >= line) hi = mid
          else lo = mid + 1
        }
        // 评审 P1：末尾无更高锚点 → 回退最后一个锚点（对齐到文档尾部）
        const target = lo < anchors.length ? anchors[lo] : anchors[anchors.length - 1]
        if (!target) return false
        el.scrollTop = target.top // 目标锚点滚到容器顶部（即时、同步）
      } else {
        const maxScroll = el.scrollHeight - el.clientHeight
        if (maxScroll <= 0) return false
        const totalLines = content.split('\n').length
        el.scrollTop = Math.min(maxScroll, Math.max(0, ((line - 1) / totalLines) * maxScroll))
      }
      return true
    },
    [isMarkdown, content]
  )

  // 锚点缓存刷新：渲染内容变化后重建。缓存 top/bottom（相对容器文档顶，含已滚出部分），
  // 滚动时直接与 scrollTop 比较，避免高频 getBoundingClientRect 强制 reflow（评审 S2）。
  // 9.2.7：容器隐藏（display:none，三态切换）时 rect 无意义 → 置空锚点、跳过重建；
  // ResizeObserver 监听显示后重建并重放待定滚动行，保证切换回分屏/预览时对齐光标。
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const build = () => {
      if (el.clientHeight === 0) {
        anchorsRef.current = [] // 隐藏：无有效锚点（显示后经 ResizeObserver 重建）
        return
      }
      const cTop = el.getBoundingClientRect().top
      const scrollTop = el.scrollTop
      anchorsRef.current = Array.from(el.querySelectorAll('[data-src-line]')).map((a) => {
        const r = a.getBoundingClientRect()
        const top = r.top - cTop + scrollTop
        return { srcLine: Number(a.dataset.srcLine), top, bottom: top + r.height }
      })
      const pending = pendingScrollLineRef.current
      if (pending != null) {
        pendingScrollLineRef.current = null
        applyScrollToLine(pending)
      }
    }
    build()
    const ro = new ResizeObserver(build)
    ro.observe(el)
    return () => ro.disconnect()
  }, [html, isMarkdown, applyScrollToLine])

  /** 计算当前顶部可见的源码行（MD 二分找首个底部越过视口顶的锚点；TXT 百分比换算） */
  const computeTopLine = useCallback(() => {
    const el = scrollRef.current
    if (!el) return 0
    if (isMarkdown) {
      const scrollTop = el.scrollTop
      const anchors = anchorsRef.current
      if (!anchors || anchors.length === 0) return 0
      let lo = 0
      let hi = anchors.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (anchors[mid].bottom > scrollTop) hi = mid
        else lo = mid + 1
      }
      // 评审 P1：全部锚点滚出视口上方（文档尾部无锚点行）→ 回退最后锚点
      const top = lo < anchors.length ? anchors[lo] : anchors[anchors.length - 1]
      return top ? top.srcLine : 0
    }
    const maxScroll = el.scrollHeight - el.clientHeight
    if (maxScroll <= 0) return 0
    const totalLines = content.split('\n').length
    return Math.max(1, Math.round((el.scrollTop / maxScroll) * totalLines))
  }, [isMarkdown, content])

  // 暴露给父级：滚动到指定源码行（MD 二分定位最近锚点；TXT 百分比）。
  // 先记待定行（锚点重建后重放），再尽力即时滚动（9.2.7）。
  useImperativeHandle(
    ref,
    () => ({
      scrollToLine(line) {
        if (line < 1) return
        pendingScrollLineRef.current = line
        applyScrollToLine(line)
      }
    }),
    [applyScrollToLine]
  )

  // 事件委托：命中 <a> 即阻止应用内导航（预览链接当前窗口打开是错误行为），
  // 白名单协议转交系统；其余（# 锚点 / 相对路径 / 未知协议）静默拦截。
  // e.target.closest 兼容链接内嵌 code / strong 等子元素的情况。
  const handleClick = useCallback((e) => {
    const anchor = e.target.closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href') || ''
    e.preventDefault()
    if (isExternalLink(href)) {
      window.mework?.win?.openExternal(href)
    }
  }, [])

  // 滚动上报：programmatic 驱动期间抑制（防回环）；父级未接联动时安全跳过（?.）
  const handleScroll = useCallback(() => {
    if (progRef.current) return
    onTopLineChangeRef.current?.(computeTopLine())
  }, [computeTopLine])

  if (!isMarkdown) {
    return (
      <div className="preview" ref={scrollRef} onScroll={handleScroll}>
        <pre className="preview__text">{content}</pre>
      </div>
    )
  }
  return (
    <div className="preview" ref={scrollRef} onScroll={handleScroll}>
      <div
        className="preview__md"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleClick}
      />
    </div>
  )
})

export default PreviewPane
