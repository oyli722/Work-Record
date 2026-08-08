// MeWork ESLint 配置（flat config，ESLint 9）
// 约定：不额外引入运行时 lint 负担；未定义变量与无意义的表达式直接报错。
import js from '@eslint/js'
import react from 'eslint-plugin-react'

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
        console: 'readonly'
      }
    },
    rules: {
      ...js.configs.recommended.rules
    }
  },

  // 渲染进程（浏览器 + React JSX）
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react },
    settings: { react: { version: 'detect' } },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        console: 'readonly'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // React 19 自动 JSX runtime
      'react/prop-types': 'off' // 本阶段无 TS/PropTypes 约定
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
