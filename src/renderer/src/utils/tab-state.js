// 活动标签派生状态（OPT-3a：从 editorStore 拆分，纯函数可单测）
// file 语义状态由活动标签派生；terminal 标签下恒为 file 空值（UI 直接消费）。

export function deriveFileState(activeTab) {
  const isFile = activeTab?.type === 'file'
  return {
    currentFile: isFile ? activeTab.relPath : null,
    content: isFile ? activeTab.content : '',
    saveState: isFile ? activeTab.saveState : 'saved',
    dirty: isFile && activeTab.saveState === 'dirty',
    error: isFile ? activeTab.error : null,
    loading: isFile ? activeTab.loading : false,
    externalChange: isFile ? activeTab.externalChange : false
  }
}
