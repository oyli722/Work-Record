import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// MeWork 构建配置（electron-vite）
// 目录约定遵循 PRD §7：
//   electron/main/   —— 主进程（Node：fs / 版本 / 窗口），内含 llm/ agent/ 预留扩展点
//   electron/preload/—— preload（contextBridge 暴露受控 API，sandbox 下不直接 require Node）
//   src/renderer/    —— 渲染进程（React UI）
export default defineConfig({
  main: {
    build: {
      lib: {
        entry: 'electron/main/index.js'
      }
    }
  },
  preload: {
    build: {
      lib: {
        entry: 'electron/preload/index.js'
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()]
  }
})
