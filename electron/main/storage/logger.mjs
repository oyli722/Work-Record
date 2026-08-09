// 主进程错误日志（阶段 8.2，PRD §5.4）
// 用户定案：仅记录错误级别；主进程关键操作（启动/工作区切换等）不需要日志。
// 错误写入工作区 `.wr/logs/app.log`（经 fs-ops appendFile，受控 + pathGuard）。
// 工作区未激活时仅 console；写失败不阻断主流程。
import { getActiveFs } from './fs-context.mjs'
import { WR_DIR_NAME } from './constants.mjs'

function ts() {
  return new Date().toISOString()
}

/** 写错误日志：console + 落盘 .wr/logs/app.log（非 error 级忽略） */
export function writeLog(level, message) {
  if (level !== 'error') return // 仅错误级别
  const line = `[${ts()}] [error] ${message}\n`
  console.error(`[mework:error] ${message}`)
  try {
    const fs = getActiveFs()
    fs.appendFile(`${WR_DIR_NAME}/logs/app.log`, line).catch(() => {
      /* 写日志失败静默：不阻断主流程 */
    })
  } catch {
    /* 工作区未激活：仅 console */
  }
}

export const logError = (message) => writeLog('error', message)
