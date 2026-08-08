import { contextBridge } from 'electron'

// MeWork preload：经 contextBridge 向渲染进程暴露受控 API
// 约束（PRD §3.1.1 / §3.2.1）：sandbox:true 下无法 require Node 模块，
// 仅可用 electron 内置的 contextBridge / ipcRenderer 等白名单能力。
// 所有暴露能力必须显式、最小化；IPC 通道遵循前缀规范（fs: / win: / editor:）。

// 阶段 1 骨架：先暴露空的 window.mework，能力随子阶段逐项补充（1.3 ping）。
const api = {
  // contextBridge ping 往返能力占位：1.3 子阶段实现
}

contextBridge.exposeInMainWorld('mework', api)
