# 阶段 5 · version 版本历史设计文档

> 版本：v1.0（2026-08-09 定稿，开发前先定稿）
> 配套：《需求规格文档》PRD §4.5（版本历史）·《开发计划》阶段 5 ·《进度看板》5.x
> 本设计文档入库保留（非评审记录临时文件）。

## 1. 目标与范围

- 每次保存（自动/手动）为该文档记一版，支持回溯、对比、回滚、导出。
- 版本快照集中存放 `.wr/versions/`（衍生数据集中，PRD §3.3 / §4.3.7），工作区目录保持整洁。
- **确定性保留策略**控制磁盘占用（PRD §4.5.3）。
- 阶段 4 已预留 `renameWithVersions` / `deleteWithVersions`，本阶段填充版本库后迁移/清空自动生效。

## 2. 数据模型

### 2.1 存储布局

```
.wr/versions/
  <文档相对路径>/          # 如 docs/note.md/
    V1.md                # 完整内容快照（编号递增不重排）
    V2.md
    ...
    meta.json            # 版本元数据
```

### 2.2 meta.json 结构

```json
{
  "versions": [
    { "versionId": 1, "editedBy": "save", "ts": 1720000000000 },
    { "versionId": 2, "editedBy": "auto", "ts": 1720000006000 }
  ]
}
```

- `versionId`：1 起递增，**不重排**（精简删除后保留空号）。
- `editedBy`：`save`（手动）| `auto`（自动）| `rollback`（回滚产生）。
- `ts`：毫秒时间戳。
- 快照文件名由 `versionId` 推导（`V{n}.md`），**不冗余存储**（评审 O2）。
- `meta.json` 为**唯一真相**；`V{n}.md` 为快照文件。删除文档时整目录移除（阶段 4 预留）。

### 2.3 触发规则

| 场景 | 行为 |
|---|---|
| 手动保存 | 记版 `editedBy: save` |
| 自动保存 | 记版 `editedBy: auto` |
| 内容与上次保存内容相同 | **不记版**（doSave 跳过无变化写盘，同步跳过记版） |
| 回滚 | **强制记版** `editedBy: rollback`，原版本保留不覆盖（评审 P2：绕过「无变化跳过」检查，见 §4.3） |

## 3. 保留策略（确定性规则，PRD §4.5.3）

规则：
1. **最近 10 版**全量保留。
2. 更早版本按序号**每 10 版留 1 里程碑**：`versionId % 10 === 1`（V1、V11、V21…）。
3. **每次保存**校验：该文档版本总数 `> 50` 时执行精简——删除「非里程碑」且「不属于最近 10 版」的旧快照，**版本号不重排**（`meta.json` 移除对应条目 + 删除 `V{n}.md`）。

> **`total` 语义（评审 P1）**：指**当前磁盘快照数**（即 `meta.json` 中现存版本条目数），非累计记版次数。精简后磁盘回落至约 15 版（最近 10 + 里程碑 V1/11/21/31/41），此后需再累积至 >50 才再次精简——磁盘占用在 15~51 版间波动，上限可接受（贴合 PRD §4.5.3 字面「版本总数」，且避免每次保存都执行精简）。

判定函数（`total` = meta.json 现存版本数）：

```
shouldKeep(versionId, total):
  if versionId > total - 10:  return true   # 最近 10 版
  if versionId % 10 === 1:    return true   # 里程碑
  return total > 50                          # 总数 >50 才精简，否则全保留
```

> 精简以 `meta.json` 为真相、**幂等**（评审 S2）：先更新 meta（删条目）再删 `V{n}.md`；删文件失败不阻断、下次精简重试，避免异常中断后 meta 与快照不一致。

## 4. 架构设计

### 4.1 主进程 `version-manager` 模块

`electron/main/versions/version-manager.mjs` —— 工厂函数 `createVersionManager(fsOps)`，依赖注入 fs-ops（受控 + pathGuard，PRD §7.1），**不在 IPC 直接触碰 fs**。

方法：
- `recordVersion(relPath, content, editedBy)`：写 `V{next}.md` + 更新 `meta.json` + 执行保留策略精简。
- `listVersions(relPath)`：返回版本元数据列表（按 versionId 降序）。
- `readVersion(relPath, versionId)`：读取指定版本完整内容（供对比/回滚/导出）。

> 复用 fs-ops 现有能力（writeFile/readFile/listDirectory/delete 对 `.wr/versions/` 内路径），不新增底层 fs 方法。

### 4.2 IPC 通道（前缀 `fs:`）

| 通道 | 参数 | 返回 |
|---|---|---|
| `fs:version_record` | relPath, content, editedBy | `{ ok }` |
| `fs:version_list` | relPath | `{ versions: [...] }` |
| `fs:version_read` | relPath, versionId | `{ content }` |
| `fs:version_export` | relPath, versionId | 触发系统另存为对话框（默认落点工作区外），成功返回 `{ ok, path }` |

preload 暴露 `window.mework.fs.versionRecord / versionList / versionRead / versionExport`。

### 4.3 渲染层

- `editorStore` 保存链路：`doSave` 真正写盘后调 `recordVersion(editedBy)`，`editedBy` **显式传参**（评审 P3）：
  - 手动保存（按钮 / Ctrl+S）→ `save('save')`
  - 自动保存（scheduleAutosave）→ `save('auto')`
  - **回滚独立流程**（5.5）：恢复内容 → 强制落盘 + 强制 `recordVersion('rollback')`，并清除自动保存计时——不经通用 doSave 的「无变化跳过」，也不与自动保存竞态（评审 P2/P3）。
- **记版失败处理**（评审 S3）：主文件已落盘但 `recordVersion` 失败 → **静默降级**（不影响本次保存），console 记录，下次保存重试。
- `VersionPanel` 组件：右侧滑出面板，版本列表 + 回滚/导出操作 + 选中状态（0/1/2 版）。
- `DiffView` 组件：主内容区对比模式，左右分屏只读 + 行级差异高亮。
- 行级 diff 算法：**轻量 LCS（最长公共子序列）**，无第三方依赖；**限幅**（评审 S1）：文档行数 > 2000 时退化简单逐行对比，避免 O(n·m) 内存/时间风险。

## 5. UI 交互设计（用户定稿 2026-08-09）

- **入口**：右键文件节点 → 「版本历史」（阶段 4 右键菜单扩展）。
- **版本面板**：右侧滑出，仅放版本列表 + 操作（回滚/导出/关闭）；列表行 = `V{n}` + 时间 + 来源标签，「当前」高亮。
- **对比（复用主内容区）**：面板点选版本 → 主内容区进入**对比模式**（左右分屏只读、差异行高亮）。
  - 选 **1 个** → 对比「当前编辑内容（`contentRef` 内存值）| 选中版本」（评审 O3）。
  - 选 **2 个** → 对比「版本A | 版本B」。
  - 对比模式为只读视图，禁止编辑；关闭面板 → 主区恢复「编辑｜预览」。
- **回滚**：面板选中版 → 「回滚」→ 确认弹窗 → 独立流程：恢复内容到编辑器 + 强制落盘 + 强制记 `rollback` 版本（§4.3）。
- **导出**：面板选中版 → 「导出」→ 系统另存为，**默认落点 Documents**（评审 S4，工作区外）。

## 6. 边界与安全

- 版本库读写全部经 fs-ops / pathGuard（`.wr/` 内路径受控）。
- 回滚若当前有未保存编辑 → 先弹确认（覆盖当前内容）。
- 对比模式主区只读，防止误编辑历史视图。
- 版本导出落点默认工作区外（避免被目录树/版本库再管理，PRD §4.5.7）。

## 7. 子阶段划分

| # | 方向 |
|---|---|
| 5.1 | 主进程 version-manager（快照 + meta.json + 保留策略精简）+ IPC + preload + 单测 |
| 5.2 | 保存触发记版（editorStore 接入 versionRecord，无变化不记） |
| 5.3 | 版本列表 UI（右键入口 + 右侧滑出面板） |
| 5.4 | 主区对比视图（DiffView，单选对当前/双选对版本） |
| 5.5 | 回滚（确认 → 恢复 + 落盘 + 记 rollback 版） |
| 5.6 | 导出（另存为，默认工作区外） |
| 5.7 | 验收自测 + tag `v0.3.0-version` |

## 8. 评审处理记录（2026-08-09）

外部设计评审意见已逐条处理（各节内已标注）：
- **P1** `total` 语义 → 定义为当前磁盘快照数（§3）。
- **P2** 回滚强制记版 → 独立流程绕过「无变化跳过」（§2.3 / §4.3）。
- **P3** editedBy 链路 + 竞态 → `save(editedBy)` 显式传参 + 回滚独立调用、清自动保存计时（§4.3）。
- **S1** LCS O(n·m) → 限幅 >2000 行退化简单对比（§4.3）。
- **S2** 精简非原子 → meta 为真相、先更 meta 再删文件、幂等（§3）。
- **S3** 记版失败 → 静默降级 + 下次保存重试（§4.3）。
- **S4** 导出默认落点 → Documents（§5）。
- **O1** 措辞统一「上次保存内容」；**O2** 去 `fileName` 冗余字段；**O3** 单选对比取 `contentRef`；**O4** 保持 `fs:version_*` 前缀（均已采纳）。

---

*本设计文档为阶段 5 开发依据，定稿后开发；设计变更须先更新本文档并确认。*
