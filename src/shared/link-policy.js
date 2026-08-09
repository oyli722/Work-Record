// 外链协议白名单（阶段 3.6，PRD §4.4.3）——主进程与渲染进程共享的唯一来源。
// 用户定案：http/https 网页 + mailto/tel 用系统默认程序打开；图片不走此处（应用内显示，3.5）。
// 2026-08-09 评审 S3/S4：抽共享模块防双份正则漂移；http 收紧要求 `//`（拒 http:foo 等畸形）。
export const EXTERNAL_LINK_RE = /^(https?:\/\/|mailto|tel):/i

/** 是否为允许交系统打开的外链 */
export function isExternalLink(url) {
  return typeof url === 'string' && EXTERNAL_LINK_RE.test(url)
}
