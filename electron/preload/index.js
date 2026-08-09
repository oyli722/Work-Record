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
    writeFile: (relPath, content) => ipcRenderer.invoke('fs:write_file', relPath, content),
    listDirectory: (relPath) => ipcRenderer.invoke('fs:list_directory', relPath),
    /** 目录树聚合：一次返回目录项 + 类型（[{ name, isDirectory }]，阶段 4.1） */
    listDetail: (relPath) => ipcRenderer.invoke('fs:list_detail', relPath),
    /** 版本历史（阶段 5）：记录新版本 / 版本列表 / 读取某版本内容 */
    versionRecord: (relPath, content, editedBy) =>
      ipcRenderer.invoke('fs:version_record', relPath, content, editedBy),
    versionList: (relPath) => ipcRenderer.invoke('fs:version_list', relPath),
    versionRead: (relPath, versionId) => ipcRenderer.invoke('fs:version_read', relPath, versionId),
    mkdir: (relPath) => ipcRenderer.invoke('fs:mkdir', relPath),
    rename: (relFrom, relTo) => ipcRenderer.invoke('fs:rename', relFrom, relTo),
    /** 重命名并迁移版本库（阶段 4.3：.wr/versions 前缀递归迁移） */
    renameWithVersions: (relFrom, relTo) =>
      ipcRenderer.invoke('fs:rename_with_versions', relFrom, relTo),
    delete: (relPath) => ipcRenderer.invoke('fs:delete', relPath),
    /** 删除并清空版本库（阶段 4.4：.wr/versions 对应目录一并删除） */
    deleteWithVersions: (relPath) => ipcRenderer.invoke('fs:delete_with_versions', relPath),
    stat: (relPath) => ipcRenderer.invoke('fs:stat', relPath),
    /** 打开系统目录选择对话框，返回选中目录绝对路径或 null（工作区引导用） */
    chooseDirectory: () => ipcRenderer.invoke('fs:choose_directory')
  },

  /** 工作区管理 API（阶段 2） */
  workspace: {
    activate: (absPath) => ipcRenderer.invoke('fs:activate_workspace', absPath),
    deactivate: () => ipcRenderer.invoke('fs:deactivate_workspace'),
    status: () => ipcRenderer.invoke('fs:workspace_status')
  },

  /** 系统级操作（阶段 3.6）：外部链接用系统浏览器/默认程序打开（PRD §4.4.3） */
  win: {
    openExternal: (url) => ipcRenderer.invoke('win:open_external', url)
  }
}

contextBridge.exposeInMainWorld('mework', api)
