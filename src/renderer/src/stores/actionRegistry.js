// 应用级快捷键动作注册表（OPT-3b：替代 shortcutActionsRef 渲染期赋值）
// 组件挂载时 register（无依赖数组 → 每次渲染重新注册，闭包恒最新），卸载时 unregister；
// App 全局 keydown 分发统一经 getAction 读取。消除「谁先渲染谁生效」的隐式耦合与
// 专注模式双 Sidebar 相互覆盖的隐患（后注册覆盖，卸载自动注销）。

const actions = new Map()

/** 注册动作（key 冲突时覆盖；每次渲染调用以持最新闭包） */
export function registerAction(key, fn) {
  actions.set(key, fn)
}

/** 注销动作（组件卸载时调用） */
export function unregisterAction(key) {
  actions.delete(key)
}

/** 读取动作（App keydown 分发）；未注册返回 undefined */
export function getAction(key) {
  return actions.get(key)
}
