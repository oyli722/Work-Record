// MeWork ESLint 配置（flat config，ESLint 9）
// 约定：不额外引入运行时 lint 负担；未定义变量与无意义的表达式直接报错。
import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['node_modules', 'out', 'dist', 'release'] },

  // 主进程 / preload（Node 环境；ESM 源码经 electron-vite 构建为 CJS）
  {
    files: ['electron/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        __dirname: 'readonly',
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly' // Node 全局 URL（评审 S1：will-navigate origin 精确比较）
      }
    },
    rules: {
      ...js.configs.recommended.rules
    }
  },

  // 渲染进程（浏览器 + React JSX）
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        ResizeObserver: 'readonly' // 9.2.7 预览锚点重建（隐藏→显示触发）
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // React 19 自动 JSX runtime
      'react/prop-types': 'off', // 本阶段无 TS/PropTypes 约定
      'react-hooks/rules-of-hooks': 'error', // Hooks 调用规则（顶层 / 条件）
      'react-hooks/exhaustive-deps': 'warn' // 依赖数组完整性提示
    }
  },

  // 配置文件
  {
    files: ['*.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    rules: {
      ...js.configs.recommended.rules
    }
  }
]
