import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { homedir } from 'node:os'

// MeWork Claude CLI 探测（CC Console，设计文档 §3.5 CLI 探测 / §4 term:check_cli / §7 风险表）
// 工厂 + 依赖注入：探测执行器（run）、文件存在判定（exists）、home 目录、平台均可注入（单测 mock）。
// 职责：探测 claude CLI 是否可用 + 返回可 spawn 的命令形态。探测结果模块级缓存（设计 §7：
// 探测失败仅置灰入口，不阻塞其他功能）；invalidate() 供设置页 / 重新安装后失效缓存。
// 返回结构：
//   { installed:false }                         —— 未探测到
//   { installed:true, path, command, args, version }
//     path    ：探测到的真实路径（展示用）
//     command ：pty.spawn 用的命令（Windows 下 .cmd/.bat 经 cmd.exe /c 包装，设计 §7）
//     args    ：spawn 参数
//     version ：claude --version 首行（探测失败为 null，不阻塞）

const execFileAsync = promisify(execFile)
const DETECT_TIMEOUT = 5000

/** 默认探测执行器：运行命令并返回 stdout（where/which 或 claude --version） */
async function defaultRun(cmd, args) {
  const { stdout } = await execFileAsync(cmd, args, { timeout: DETECT_TIMEOUT })
  return stdout
}

/** 常见安装位置兜底（PATH 探测失败后逐个 exists 检查） */
function commonCandidates(home, platform) {
  if (platform === 'win32') {
    // npm 全局 shim（%APPDATA%\npm\claude.cmd）
    return [join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd')]
  }
  // macOS 优先 Homebrew（arm）再 /usr/local；Linux 常规 bin 目录
  const unix = ['/opt/homebrew/bin/claude', '/usr/local/bin/claude', '/usr/bin/claude']
  return platform === 'darwin' ? unix : ['/usr/local/bin/claude', '/usr/bin/claude']
}

/**
 * 创建 cli-detect 实例。
 * @param {object} deps 依赖注入（默认取真实实现）
 * @returns {{ detect: () => Promise<object>, invalidate: () => void }}
 */
export function createCliDetect({
  run = defaultRun,
  exists = existsSync,
  home = homedir(),
  platform = process.platform,
  comSpec = process.env.ComSpec || 'cmd.exe'
} = {}) {
  let cached = null

  /** 探测 claude CLI（结果缓存；installed 恒为 false 也缓存，避免重复探测） */
  async function detect() {
    if (cached) return cached
    cached = await detectClaude({ run, exists, home, platform, comSpec })
    return cached
  }

  /** 失效缓存（设置页开关 / 用户声称已安装后重测） */
  function invalidate() {
    cached = null
  }

  return { detect, invalidate }
}

/** 一次完整探测：PATH → 常见安装位置 → 解析 spawn 形态 → 版本 */
async function detectClaude({ run, exists, home, platform, comSpec }) {
  const path = (await findOnPath(run, platform)) || findInCandidates(exists, home, platform)
  if (!path) return { installed: false }

  const { command, args } = resolveSpawn(platform, comSpec, path)
  const version = await detectVersion(run, command, args)

  return { installed: true, path, command, args, version }
}

/** PATH 探测：where claude（Windows）/ which claude（unix）；失败返回 null */
async function findOnPath(run, platform) {
  const findCmd = platform === 'win32' ? 'where' : 'which'
  try {
    const out = await run(findCmd, ['claude'])
    const first = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
    return first || null
  } catch {
    return null // where/which 不存在，或 claude 不在 PATH → 走常见安装位置
  }
}

/** 常见安装位置兜底：返回第一个存在的候选路径 */
function findInCandidates(exists, home, platform) {
  return commonCandidates(home, platform).find((p) => exists(p)) || null
}

/** 解析可 spawn 的命令形态：Windows .cmd/.bat 经 cmd.exe /c 包装（设计 §7 风险表） */
function resolveSpawn(platform, comSpec, path) {
  const ext = extname(path).toLowerCase()
  if (platform === 'win32' && (ext === '.cmd' || ext === '.bat')) {
    return { command: comSpec, args: ['/c', path] }
  }
  return { command: path, args: [] }
}

/** 版本探测：command args --version 首行；失败返回 null（不阻塞） */
async function detectVersion(run, command, args) {
  try {
    const out = await run(command, [...args, '--version'])
    return out.trim().split(/\r?\n/)[0] || null
  } catch {
    return null
  }
}
