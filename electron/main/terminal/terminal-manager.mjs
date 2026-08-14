import { randomUUID } from 'node:crypto'
import * as nodePty from 'node-pty'

// MeWork 终端管理（CC Console，设计文档 §2 / §3.5）
// 工厂 + 依赖注入（PRD §3.5）：pty 实现可注入（单测 mock），默认 node-pty。
// 每个终端 = 一个 pty 会话；termId 由主进程生成（randomUUID），渲染进程仅持有 termId 句柄，
// 不经渲染进程拼接路径（设计文档 §4 安全）。
// CC-1 用默认 shell 跑通「echo 终端」双链路；CC-2 起改为 spawn claude CLI（cli-detect 探测后）。

/** 跨平台默认 shell（Windows 走 ComSpec/cmd，其余走 $SHELL/bash） */
function defaultShell() {
  if (process.platform === 'win32') return process.env.ComSpec || 'cmd.exe'
  return process.env.SHELL || 'bash'
}

export function createTerminalManager({ pty = nodePty, shell = defaultShell() } = {}) {
  const sessions = new Map() // termId -> { proc }

  /** 创建终端会话：spawn shell，返回 termId */
  function create({ cwd, cols = 80, rows = 24, onData, onExit }) {
    const termId = randomUUID()
    const proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: process.env
    })
    proc.onData((chunk) => onData?.(termId, chunk))
    proc.onExit(({ exitCode }) => {
      sessions.delete(termId)
      onExit?.(termId, exitCode)
    })
    sessions.set(termId, { proc })
    return termId
  }

  /** 键盘输入写入 pty */
  function write(termId, data) {
    sessions.get(termId)?.proc.write(data)
  }

  /** 终端尺寸同步（cols/rows） */
  function resize(termId, cols, rows) {
    sessions.get(termId)?.proc.resize(cols, rows)
  }

  /** 关闭终端：杀 pty 进程 */
  function kill(termId) {
    const session = sessions.get(termId)
    if (!session) return
    sessions.delete(termId)
    try {
      session.proc.kill()
    } catch {
      /* 进程可能已退出 */
    }
  }

  /** 应用退出 / 工作区切换：统一关闭全部会话（CC-7 边界接入） */
  function killAll() {
    for (const termId of [...sessions.keys()]) kill(termId)
  }

  return { create, write, resize, kill, killAll }
}
