import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../../src/shared/ipc-channels'

// MeWork preload：经 contextBridge 向渲染进程暴露受控 API
// 约束（PRD §3.1.1 / §3.2.1）：sandbox:true 下无法 require Node 模块，
// 仅可用 electron 内置的 contextBridge / ipcRenderer 等白名单能力。
// 所有暴露能力必须显式、最小化；IPC 通道统一引用 src/shared/ipc-channels.js（单一来源）。

// 渲染进程可见的受控 API（window.mework）
const api = {
  /** 连通性自检：渲染进程 → 主进程 ping 往返（阶段 1） */
  ping: () => ipcRenderer.invoke(IPC.fs.ping),

  /** 错误日志上报（8.2，PRD §5.4）：写主进程日志 */
  log: (level, message) => ipcRenderer.invoke(IPC.fs.log, level, message),

  /** 文件系统受控 API（阶段 2，全部经主进程 pathGuard 沙箱） */
  fs: {
    readFile: (relPath) => ipcRenderer.invoke(IPC.fs.readFile, relPath),
    writeFile: (relPath, content) => ipcRenderer.invoke(IPC.fs.writeFile, relPath, content),
    /** 写入原始字节（9.3.3 图片粘贴）：Uint8Array 落盘 */
    writeFileBinary: (relPath, data) => ipcRenderer.invoke(IPC.fs.writeFileBinary, relPath, data),
    listDirectory: (relPath) => ipcRenderer.invoke(IPC.fs.listDirectory, relPath),
    /** 目录树聚合：一次返回目录项 + 类型（[{ name, isDirectory }]，阶段 4.1） */
    listDetail: (relPath) => ipcRenderer.invoke(IPC.fs.listDetail, relPath),
    /** 版本历史（阶段 5）：记录新版本 / 版本列表 / 读取某版本内容 */
    versionRecord: (relPath, content, editedBy) =>
      ipcRenderer.invoke(IPC.fs.versionRecord, relPath, content, editedBy),
    versionList: (relPath) => ipcRenderer.invoke(IPC.fs.versionList, relPath),
    versionRead: (relPath, versionId) => ipcRenderer.invoke(IPC.fs.versionRead, relPath, versionId),
    /** 导出版本为独立文件（阶段 5.6：另存为，默认 Documents） */
    versionExport: (relPath, versionId) => ipcRenderer.invoke(IPC.fs.versionExport, relPath, versionId),
    mkdir: (relPath) => ipcRenderer.invoke(IPC.fs.mkdir, relPath),
    rename: (relFrom, relTo) => ipcRenderer.invoke(IPC.fs.rename, relFrom, relTo),
    /** 重命名并迁移版本库（阶段 4.3：.wr/versions 前缀递归迁移） */
    renameWithVersions: (relFrom, relTo) =>
      ipcRenderer.invoke(IPC.fs.renameWithVersions, relFrom, relTo),
    delete: (relPath) => ipcRenderer.invoke(IPC.fs.delete, relPath),
    /** 删除并清空版本库（阶段 4.4：.wr/versions 对应目录一并删除） */
    deleteWithVersions: (relPath) => ipcRenderer.invoke(IPC.fs.deleteWithVersions, relPath),
    stat: (relPath) => ipcRenderer.invoke(IPC.fs.stat, relPath),
    /** 打开系统目录选择对话框，返回选中目录绝对路径或 null（工作区引导用） */
    chooseDirectory: () => ipcRenderer.invoke(IPC.fs.chooseDirectory)
  },

  /** 工作区管理 API（阶段 2） */
  workspace: {
    activate: (absPath) => ipcRenderer.invoke(IPC.fs.activateWorkspace, absPath),
    deactivate: () => ipcRenderer.invoke(IPC.fs.deactivateWorkspace),
    status: () => ipcRenderer.invoke(IPC.fs.workspaceStatus)
  },

  /** 系统级操作：外部链接用系统浏览器打开（3.6，PRD §4.4.3）；资源管理器定位（9.2.8） */
  win: {
    openExternal: (url) => ipcRenderer.invoke(IPC.win.openExternal, url),
    /** 在系统资源管理器中定位（文件）/ 打开（文件夹、工作区根）。relPath 为工作区相对路径，'.' 即根 */
    reveal: (relPath, isDir) => ipcRenderer.invoke(IPC.win.reveal, relPath, isDir),
    /** 应用版本号（9.3.5）：动态读取 package.json version，关于页展示 */
    getVersion: () => ipcRenderer.invoke(IPC.win.getAppVersion)
  },

  /** 终端（CC Console，设计文档 §4：term: 前缀）。termId 由主进程生成，渲染层仅持有句柄 */
  term: {
    /** 探测 claude CLI：{ installed, path, version? }（设置页 / 右键菜单置灰判断） */
    checkCli: () => ipcRenderer.invoke(IPC.term.checkCli),
    create: (cwdRelPath) => ipcRenderer.invoke(IPC.term.create, cwdRelPath),
    write: (termId, data) => ipcRenderer.invoke(IPC.term.write, termId, data),
    resize: (termId, cols, rows) => ipcRenderer.invoke(IPC.term.resize, termId, cols, rows),
    kill: (termId) => ipcRenderer.invoke(IPC.term.kill, termId),
    /** 订阅终端输出；返回取消订阅函数（组件卸载时调用防泄漏） */
    onData: (cb) => {
      const listener = (_e, termId, chunk) => cb(termId, chunk)
      ipcRenderer.on(IPC.term.dataEvent, listener)
      return () => ipcRenderer.removeListener(IPC.term.dataEvent, listener)
    },
    /** 订阅进程退出事件 */
    onExit: (cb) => {
      const listener = (_e, termId, code) => cb(termId, code)
      ipcRenderer.on(IPC.term.exitEvent, listener)
      return () => ipcRenderer.removeListener(IPC.term.exitEvent, listener)
    }
  }
}

contextBridge.exposeInMainWorld('mework', api)
