import { appendFile as fsAppend, readFile, writeFile, readdir, mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { WR_DIR_NAME } from './constants.mjs'

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

    /** 读取文件原始字节（Buffer，预览图片用，mework-file:// 协议，3.5） */
    async readFileRaw(relPath) {
      const abs = await safe(relPath)
      return readFile(abs)
    },

    /** 写入文件（UTF-8 文本）。父目录不存在则递归创建。 */
    async writeFile(relPath, content) {
      const abs = await safe(relPath)
      await mkdir(dirname(abs), { recursive: true })
      await writeFile(abs, content, 'utf-8')
    },

    /** 写入文件原始字节（9.3.3 图片粘贴等）。data 为 Uint8Array/Buffer，不做文本编码。 */
    async writeFileBinary(relPath, data) {
      const abs = await safe(relPath)
      await mkdir(dirname(abs), { recursive: true })
      await writeFile(abs, data)
    },

    /** 追加写入（UTF-8 文本，日志用，8.2）。文件不存在则创建。 */
    async appendFile(relPath, content) {
      const abs = await safe(relPath)
      await mkdir(dirname(abs), { recursive: true })
      await fsAppend(abs, content, 'utf-8')
    },

    /** 列出目录项（名称数组）。仅顶层，不递归（递归由目录树阶段负责）。
        过滤衍生数据目录 `.wr/`（PRD §3.3/§4.3.7）：目录树等 UI 默认不可见，评审 S1。 */
    async listDirectory(relPath) {
      const abs = await safe(relPath)
      const entries = await readdir(abs)
      return entries.filter((name) => name !== WR_DIR_NAME)
    },

    /** 列出目录项并带类型（[{ name, isDirectory }]，4.1）。
        一次 IPC 返回条目与 stat，避免目录树逐项 stat 造成 IPC 洪泛（评审 S1）。
        与 listDirectory 同源过滤 `.wr/`；单项 stat 失败（并发删除等）跳过不抛。 */
    async listDetail(relPath) {
      const abs = await safe(relPath)
      const entries = await readdir(abs)
      const items = []
      for (const name of entries) {
        if (name === WR_DIR_NAME) continue
        try {
          const info = await stat(join(abs, name))
          items.push({ name, isDirectory: info.isDirectory() })
        } catch {
          /* 单项 stat 失败：跳过（并发删除 / 权限边界），不中断整列 */
        }
      }
      return items
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

    /** 重命名并迁移版本库（4.3，PRD §4.3.4）。
        文件/文件夹重命名后，`.wr/versions/<relFrom>` 整体迁移到 `<relTo>`（文件夹即前缀递归迁移）。
        版本库目录由阶段 5 填充；当前源不存在则跳过（阶段 4 预留调用，阶段 5 后自动生效）。 */
    async renameWithVersions(relFrom, relTo) {
      await this.rename(relFrom, relTo)
      const from = await safe(`${WR_DIR_NAME}/versions/${relFrom}`)
      const to = await safe(`${WR_DIR_NAME}/versions/${relTo}`)
      try {
        await stat(from)
      } catch {
        return // 版本库尚不存在（阶段 5 填充后才生成），无需迁移
      }
      await mkdir(dirname(to), { recursive: true })
      await rename(from, to)
    },

    /** 删除文件或目录。目录递归删除（调用方负责二次确认等保护）。 */
    async delete(relPath) {
      const abs = await safe(relPath)
      const info = await stat(abs)
      await rm(abs, { recursive: info.isDirectory(), force: false })
    },

    /** 删除并清空版本库（4.4，PRD §4.3.5）。
        删除文件/文件夹后，`.wr/versions/<relPath>` 一并清空（文件夹即递归清空其下所有版本库）。
        版本库由阶段 5 填充；当前不存在则跳过（阶段 4 预留调用）。 */
    async deleteWithVersions(relPath) {
      await this.delete(relPath)
      const versions = await safe(`${WR_DIR_NAME}/versions/${relPath}`)
      try {
        await rm(versions, { recursive: true, force: false })
      } catch {
        /* 版本库尚不存在（阶段 5 填充后才生成）：跳过 */
      }
    },

    /** 查询路径状态（存在性 / 类型 / 修改时间 / 大小），供 UI 判断与外部改动检测（8.4）。 */
    async stat(relPath) {
      const abs = await safe(relPath)
      const info = await stat(abs)
      return {
        exists: true,
        isDirectory: info.isDirectory(),
        isFile: info.isFile(),
        mtimeMs: info.mtimeMs,
        size: info.size
      }
    },

    /** 解析工作区根内相对路径为绝对路径（9.2.8 资源管理器定位等系统操作用）。
        仅沙箱校验后返回绝对路径，不做磁盘访问；相对工作区根，'.' 解析为根目录。
        绝对路径只在主进程内使用（shell 系统调用），不外泄给渲染进程。 */
    async resolveAbsolute(relPath) {
      return safe(relPath)
    }
  }
}
