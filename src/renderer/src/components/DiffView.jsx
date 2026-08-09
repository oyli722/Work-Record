// 版本对比视图（阶段 5.4，PRD §4.5.5）
// 主内容区分屏只读：左右两栏并排，行级 diff 高亮（新增绿 / 删除红 / 相同对齐）。
// 对齐行高一致 → 两栏滚动天然同步，无需额外联动。
// 算法：轻量行级 LCS（无第三方依赖）；限幅 >2000 行退化简单逐行对比（评审 S1）。
import { useMemo } from 'react'

const SIMPLE_LIMIT = 2000

/** 行级 diff：返回对齐行序列 [{ type: 'common'|'del'|'add', left, right }] */
function diffLines(a, b) {
  const A = String(a ?? '').split('\n')
  const B = String(b ?? '').split('\n')
  if (Math.max(A.length, B.length) > SIMPLE_LIMIT) {
    // 限幅退化：逐行对齐，不同行左右都标记为改动（评审 S1：避免 O(n·m) 爆内存）
    const rows = []
    const n = Math.max(A.length, B.length)
    for (let i = 0; i < n; i++) {
      const left = A[i] ?? ''
      const right = B[i] ?? ''
      rows.push(left === right ? { type: 'common', left, right } : { type: 'add', left, right })
    }
    return rows
  }
  const n = A.length
  const m = B.length
  // DP LCS 长度表（Uint16Array 控制内存）
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  // 回溯生成对齐行
  const rows = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      rows.push({ type: 'common', left: A[i], right: B[j] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: 'del', left: A[i], right: null })
      i++
    } else {
      rows.push({ type: 'add', left: null, right: B[j] })
      j++
    }
  }
  while (i < n) rows.push({ type: 'del', left: A[i++], right: null })
  while (j < m) rows.push({ type: 'add', left: null, right: B[j++] })
  return rows
}

export default function DiffView({ left, right, leftLabel, rightLabel }) {
  const rows = useMemo(() => diffLines(left, right), [left, right])
  return (
    <div className="diffview">
      <div className="diffview__header">
        <span className="diffview__label" title={leftLabel}>
          {leftLabel}
        </span>
        <span className="diffview__label" title={rightLabel}>
          {rightLabel}
        </span>
      </div>
      <div className="diffview__body">
        {rows.map((row, idx) => (
          <div key={idx} className={`diffview__row diffview__row--${row.type}`}>
            <div className="diffview__cell">{row.left ?? ''}</div>
            <div className="diffview__cell">{row.right ?? ''}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
