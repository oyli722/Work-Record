import { contextBridge, ipcRenderer } from 'electron'

// MeWork preload：经 contextBridge 向渲染进程暴露受控 API
// 约束（PRD §3.1.1 / §3.2.1）：sandbox:true 下无法 require Node 模块，
// 仅可用 electron 内置的 contextBridge / ipcRenderer 等白名单能力。
// 所有暴露能力必须显式、最小化；IPC 通道遵循前缀规范（fs: / win: / editor:）。

// 渲染进程可见的受控 API（window.mework）
const api = {
  /** 连通性自检：渲染进程 → 主进程 ping 往返（阶段 1） */
  ping: () => ipcRenderer.invoke('fs:ping'),

  /** 文件系统受控 API（阶段 2，全部经主进程 pathGuard 沙箱） */
  fs: {
    readFile: (relPath) => ipcRenderer.invoke('fs:read_file', relPath),
    writeFile: (relPath, content) =>
      ipcRenderer.invoke('fs:write_file', relPath, content),
    listDirectory: (relPath) =>
      ipcRenderer.invoke('fs:list_directory', relPath),
    mkdir: (relPath) => ipcRenderer.invoke('fs:mkdir', relPath),
    rename: (relFrom, relTo) =>
      ipcRenderer.invoke('fs:rename', relFrom, relTo),
    delete: (relPath) => ipcRenderer.invoke('fs:delete', relPath),
    stat: (relPath) => ipcRenderer.invoke('fs:stat', relPath),
    /** 打开系统目录选择对话框，返回选中目录绝对路径或 null（工作区引导用） */
    chooseDirectory: () => ipcRenderer.invoke('fs:choose_directory')
  },

  /** 工作区管理 API（阶段 2） */
  workspace: {
    activate: (absPath) => ipcRenderer.invoke('fs:activate_workspace', absPath),
    deactivate: () => ipcRenderer.invoke('fs:deactivate_workspace'),
    status: () => ipcRenderer.invoke('fs:workspace_status')
  }
}

contextBridge.exposeInMainWorld('mework', api)
