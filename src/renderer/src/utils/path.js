// 工作区相对路径工具（渲染进程）
// 路径统一以 '/' 分隔（工作区内约定）；供 Sidebar / EditorPane / TabBar 等共用，
// 消除各组件重复实现（原 Sidebar.jsx / EditorPane.jsx 各有一份 dirOf，TabBar 有 fileNameOf）。

/** 相对路径的目录部分（工作区内，'/' 分隔）；无目录返回 '' */
export function dirOf(relPath) {
  const i = relPath.lastIndexOf('/')
  return i === -1 ? '' : relPath.slice(0, i)
}

/** 相对路径的文件名（最后一段，含扩展名）；无 '/' 时原样返回 */
export function fileNameOf(relPath) {
  const i = relPath.lastIndexOf('/')
  return i === -1 ? relPath : relPath.slice(i + 1)
}
