import { protocol } from 'electron'
import { extname } from 'node:path'
import { getActiveFs } from '../storage/fs-context.mjs'

/**
 * mework-file:// 自定义协议（阶段 3.5，PRD §4.4.2/§4.4.5）
 *
 * 预览中相对路径图片基于当前文件所在目录解析，但渲染进程（webSecurity + sandbox）
 * 不能直接读 file://，故经此协议：渲染进程将工作区内相对路径编码为
 * `mework-file:///<relPath>`，主进程经当前 fs-ops（pathGuard 沙箱）读取原始字节返回。
 * 远程 https 图片不走此协议（直接 <img> 加载，内容呈现，PRD §4.4.5）。
 *
 * 必须在 app ready 前 registerSchemesAsPrivileged（standard + secure），
 * ready 后 protocol.handle 生效。
 */

const SCHEME = 'mework-file'

/** 图片扩展名 → MIME（预览所需） */
const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp'
}

/** app ready 前调用：声明协议特权（standard 使 URL 可解析 host/path，secure 视为安全源） */
export function registerMeworkFileScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true, // standard 使 URL 可作资源加载（Chromium 要求）
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true, // file:// 跨源加载需 CORS
        stream: true
      }
    }
  ])
}

/** app ready 后调用：注册协议 handler */
export function registerMeworkFileHandler() {
  protocol.handle(SCHEME, async (request) => {
    // mework-file://img/<encoded relPath> → pathname 去掉前导 /
    const url = new URL(request.url)
    const relPath = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    if (!relPath) return new Response('bad request', { status: 400 })
    try {
      const buffer = await getActiveFs().readFileRaw(relPath)
      const mime = MIME[extname(relPath).toLowerCase()] ?? 'application/octet-stream'
      // CORS：渲染进程（file:// / http dev）跨源加载本地图需允许（corsEnabled: true）
      return new Response(buffer, {
        headers: {
          'content-type': mime,
          'access-control-allow-origin': '*'
        }
      })
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}
