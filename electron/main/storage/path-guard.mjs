import { isAbsolute, parse, resolve, sep } from 'node:path'
import { realpath } from 'node:fs/promises'

/**
 * pathGuard 路径沙箱（PRD §3.2.2 / §2.7）
 *
 * 工厂函数：以工作区根目录为沙箱边界，拒绝三类穿越：
 *   (a) 绝对路径穿越 —— 输入必须是相对工作区的路径
 *   (b) ../ 相对穿越 —— 归一化后不得跳出根目录子树
 *   (c) symlink realpath 逃逸 —— 目标真实路径必须落在根目录 realpath 子树内
 *
 * 设计：工厂 + 依赖注入（PRD §3.5.1）。根目录在创建时固定，后续无法更改，
 * 每个激活的工作区各自持有独立 guard 实例（PRD §8.2.9）。
 *
 * 使用 `.mjs` 扩展名：electron-vite 正常打包，同时 node --test 可直导入单测；
 * package.json 保持 CommonJS（不设 "type":"module"）以保障 sandbox:true 下
 * preload 输出 CJS 兼容（阶段 1 O1 观察项，勿改）。
 */

/** 返回目标路径或其最近真实存在祖先的 realpath（目标本身可能尚不存在，如新建文件） */
async function realpathUp(absPath) {
  let current = absPath
  const driveRoot = parse(absPath).root
  while (current !== driveRoot) {
    try {
      return await realpath(current)
    } catch {
      const parent = resolve(current, '..')
      if (parent === current) break // 已到根，防死循环
      current = parent
    }
  }
  return driveRoot
}

/** Windows 路径大小写不敏感，比较前统一小写；其余平台原样 */
function normalizeCase(p) {
  return process.platform === 'win32' ? p.toLowerCase() : p
}

export function createPathGuard(root) {
  // 根目录绝对化 + 去尾部分隔符，保证子树前缀判断正确
  const rootAbs = resolve(root)
  const rootTrim = rootAbs.replace(/[\\/]+$/, '')
  const rootWithSep = rootTrim + sep

  // 惰性缓存根目录 realpath（根本身也可能在 symlink 下）
  let rootRealPromise = null
  const getRootReal = () => {
    rootRealPromise ??= realpath(rootAbs).catch(() => rootAbs)
    return rootRealPromise
  }

  /** (a)(b) 纯路径校验：返回归一化绝对路径；穿越则抛错（同步，无 IO） */
  function resolvePath(input) {
    if (typeof input !== 'string' || input.length === 0) {
      throw new Error('pathGuard: 路径不能为空')
    }
    if (isAbsolute(input) || /^[a-zA-Z]:[\\/]/.test(input)) {
      throw new Error(`pathGuard: 拒绝绝对路径「${input}」`)
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input)) {
      throw new Error(`pathGuard: 拒绝协议路径「${input}」`)
    }
    const abs = resolve(rootTrim, input)
    if (abs !== rootTrim && !abs.startsWith(rootWithSep)) {
      throw new Error(`pathGuard: 路径穿越拒绝「${input}」`)
    }
    return abs
  }

  /** (c) symlink 逃逸校验：目标真实路径必须落在根 realpath 子树内 */
  async function assertNoSymlinkEscape(absPath) {
    const [rootRealRaw, targetRealRaw] = await Promise.all([
      getRootReal(),
      realpathUp(absPath)
    ])
    const rootReal = normalizeCase(rootRealRaw.replace(/[\\/]+$/, ''))
    const targetReal = normalizeCase(targetRealRaw)
    if (targetReal !== rootReal && !targetReal.startsWith(rootReal + sep)) {
      throw new Error(`pathGuard: symlink 逃逸拒绝「${absPath}」`)
    }
    return targetRealRaw
  }

  return {
    /** 工作区根目录（绝对化、去尾部分隔符） */
    get root() {
      return rootTrim
    },

    /** 纯路径校验（同步） */
    resolvePath,

    /** 完整校验（含 symlink realpath）：通过则返回绝对路径 */
    async assertSafe(relPath) {
      const abs = resolvePath(relPath)
      await assertNoSymlinkEscape(abs)
      return abs
    }
  }
}
