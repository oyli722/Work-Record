import { readFile, writeFile, readdir, mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * fs-ops 受控文件系统抽象层（PRD §7.1）
 *
 * 工厂函数 `createFsOps(guard)`：所有文件读写统一经 pathGuard 校验后执行，
 * 不在 IPC handler 中直接调用 fs（PRD §7.1）。函数签名保持可被未来 Agent
 * 工具层（L0 tools）直接复用；新增 fs 操作一律加在此模块导出。
 *
 * 所有方法签名以「相对工作区根目录的 relPath」为输入，返回受控结果；
 * 非法路径（穿越 / 逃逸）在进入 fs 前被 guard 拒绝并抛错。
 *
 * 使用 `.mjs` 扩展名以支持 node --test 直导入（同 path-guard.mjs 约定）。
 */

export function createFsOps(guard) {
  /** 校验并返回绝对路径 */
  const safe = (relPath) => guard.assertSafe(relPath)

  return {
    /** 读取文件（UTF-8 文本）。失败抛错含明确信息。 */
    async readFile(relPath) {
      const abs = await safe(relPath)
      return readFile(abs, 'utf-8')
    },

    /** 写入文件（UTF-8 文本）。父目录不存在则递归创建。 */
    async writeFile(relPath, content) {
      const abs = await safe(relPath)
      await mkdir(dirname(abs), { recursive: true })
      await writeFile(abs, content, 'utf-8')
    },

    /** 列出目录项（名称数组）。仅顶层，不递归（递归由目录树阶段负责）。 */
    async listDirectory(relPath) {
      const abs = await safe(relPath)
      return readdir(abs)
    },

    /** 创建目录（递归）。 */
    async mkdir(relPath) {
      const abs = await safe(relPath)
      await mkdir(abs, { recursive: true })
    },

    /** 重命名 / 移动。源与目标均须在根内。 */
    async rename(relFrom, relTo) {
      const [absFrom, absTo] = await Promise.all([safe(relFrom), safe(relTo)])
      await mkdir(dirname(absTo), { recursive: true })
      await rename(absFrom, absTo)
    },

    /** 删除文件或目录。目录递归删除（调用方负责二次确认等保护）。 */
    async delete(relPath) {
      const abs = await safe(relPath)
      const info = await stat(abs)
      await rm(abs, { recursive: info.isDirectory(), force: false })
    },

    /** 查询路径状态（存在性 / 类型），供 UI 判断。 */
    async stat(relPath) {
      const abs = await safe(relPath)
      const info = await stat(abs)
      return { exists: true, isDirectory: info.isDirectory(), isFile: info.isFile() }
    }
  }
}
