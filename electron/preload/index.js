import { contextBridge, ipcRenderer } from 'electron'

// MeWork preload：经 contextBridge 向渲染进程暴露受控 API
// 约束（PRD §3.1.1 / §3.2.1）：sandbox:true 下无法 require Node 模块，
// 仅可用 electron 内置的 contextBridge / ipcRenderer 等白名单能力。
// 所有暴露能力必须显式、最小化；IPC 通道遵循前缀规范（fs: / win: / editor:）。

// 渲染进程可见的受控 API（window.mework）
const api = {
  /** 连通性自检：渲染进程 → 主进程 ping 往返（阶段 1） */
  ping: () => ipcRenderer.invoke('fs:ping')
}

contextBridge.exposeInMainWorld('mework', api)
