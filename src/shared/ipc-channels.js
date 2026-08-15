// IPC 通道名单一来源（主进程 handler 与 preload 共用，防字符串漂移——原各文件硬编码）
// 前缀规范（PRD §3.1.2）：fs: / win: / editor:；预留 agent: / llm:（未来 AI 扩展）。
// 新增通道一律在此登记，preload 与 electron/main/ipc/*.mjs 共同引用；事件通道（推渲染）同列。

export const IPC = {
  fs: {
    ping: 'fs:ping',
    readFile: 'fs:read_file',
    writeFile: 'fs:write_file',
    writeFileBinary: 'fs:write_file_binary', // 9.3.3 图片粘贴：Uint8Array 原样写入
    listDirectory: 'fs:list_directory',
    listDetail: 'fs:list_detail', // 4.1 目录树聚合：一次返回 name+isDirectory
    mkdir: 'fs:mkdir',
    rename: 'fs:rename',
    renameWithVersions: 'fs:rename_with_versions', // 4.3 重命名 + 版本库迁移
    delete: 'fs:delete',
    deleteWithVersions: 'fs:delete_with_versions', // 4.4 删除 + 版本库清空
    stat: 'fs:stat',
    log: 'fs:log', // 8.2 渲染层错误上报
    chooseDirectory: 'fs:choose_directory',
    versionRecord: 'fs:version_record',
    versionList: 'fs:version_list',
    versionRead: 'fs:version_read',
    versionExport: 'fs:version_export', // 5.6 导出版本（系统另存为）
    activateWorkspace: 'fs:activate_workspace',
    deactivateWorkspace: 'fs:deactivate_workspace',
    workspaceStatus: 'fs:workspace_status'
  },
  win: {
    openExternal: 'win:open_external', // 3.6 外链交系统打开
    reveal: 'win:reveal', // 9.2.8 资源管理器定位 / 打开
    getAppVersion: 'win:get_app_version' // 9.3.5 动态版本号
  },
  term: {
    checkCli: 'term:check_cli', // CC Console：CLI 探测
    create: 'term:create',
    write: 'term:write',
    resize: 'term:resize',
    kill: 'term:kill',
    dataEvent: 'term:data', // 主进程 → 渲染：pty 输出
    exitEvent: 'term:exit' // 主进程 → 渲染：进程退出
  }
}
