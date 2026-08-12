// 主进程错误日志（阶段 8.2，PRD §5.4；9.3.4 日志轮转）
// 用户定案：仅记录错误级别；主进程关键操作（启动/工作区切换等）不需要日志。
// 错误写入工作区 `.wr/logs/app.log`（经 fs-ops appendFile，受控 + pathGuard）。
// 9.3.4 轮转：单文件超 MAX_LOG_BYTES 时删最旧、逐级移位、app.log→app.log.1，
// 保留最多 MAX_LOG_FILES 份（app.log + N-1 备份）。工作区未激活时仅 console；写失败不阻断主流程。
import { getActiveFs } from './fs-context.mjs'
import { WR_DIR_NAME } from './constants.mjs'

/** 单日志文件字节上限（512KB，error 级日志量小，足够） */
export const MAX_LOG_BYTES = 512 * 1024
/** 保留日志文件总数（app.log + N-1 个备份） */
export const MAX_LOG_FILES = 5

const LOG_PATH = `${WR_DIR_NAME}/logs/app.log`

function ts() {
  return new Date().toISOString()
}

/**
 * 9.3.4 日志轮转：app.log 超限时删最旧备份、逐级移位（.i → .i+1）、app.log → app.log.1。
 * 注入 fs（fs-ops 实例）便于单测；新 app.log 由下次 append 自动重建。
 * @returns {Promise<boolean>} 是否执行了轮转
 */
export async function rotateLogs(fs, { maxBytes = MAX_LOG_BYTES, maxFiles = MAX_LOG_FILES } = {}) {
  let info
  try {
    info = await fs.stat(LOG_PATH)
  } catch {
    return false // app.log 不存在：无需轮转
  }
  if (!info.exists || info.size < maxBytes) return false
  // 删最旧（超出保留数的那份），再逐级移位；从高序号往低移位，目标始终已腾空（兼容 Windows rename 目标需不存在）
  const oldest = `${LOG_PATH}.${maxFiles - 1}`
  try {
    await fs.delete(oldest)
  } catch {
    /* 最旧备份不存在：忽略 */
  }
  for (let i = maxFiles - 2; i >= 1; i--) {
    try {
      await fs.rename(`${LOG_PATH}.${i}`, `${LOG_PATH}.${i + 1}`)
    } catch {
      /* 该序号备份不存在：跳过 */
    }
  }
  try {
    await fs.rename(LOG_PATH, `${LOG_PATH}.1`)
  } catch {
    /* app.log 已被外部删除等：忽略 */
  }
  return true
}

/** 写错误日志：console + 落盘 .wr/logs/app.log（先轮转后追加；非 error 级忽略） */
export function writeLog(level, message) {
  if (level !== 'error') return // 仅错误级别
  const line = `[${ts()}] [error] ${message}\n`
  console.error(`[mework:error] ${message}`)
  try {
    const fs = getActiveFs()
    ;(async () => {
      try {
        await rotateLogs(fs)
        await fs.appendFile(LOG_PATH, line)
      } catch {
        /* 写日志失败静默：不阻断主流程 */
      }
    })()
  } catch {
    /* 工作区未激活：仅 console */
  }
}

export const logError = (message) => writeLog('error', message)
