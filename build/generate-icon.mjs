// 生成应用图标 build/icon.png（256×256，阶段 8.5）
// 设计：accent 蓝背景 + 白色圆角方块（简洁占位，后续可替换正式图标）。
// 运行：node build/generate-icon.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const W = 256
const H = 256
const ACCENT = [0x0a, 0x84, 0xff] // #0A84FF
const WHITE = [255, 255, 255]

// PNG CRC32
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

// 像素：中央白色圆角方块（圆角半径 ~40px），外圈 accent 蓝
const raw = Buffer.alloc(H * (1 + W * 4))
const rx = W * 0.34
const ry = H * 0.34
const corner = W * 0.16
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0 // filter none
  for (let x = 0; x < W; x++) {
    const dx = Math.abs(x - W / 2 + 0.5)
    const dy = Math.abs(y - H / 2 + 0.5)
    const cx = Math.max(0, dx - (rx - corner))
    const cy = Math.max(0, dy - (ry - corner))
    const rounded = dx <= rx && dy <= ry && Math.hypot(cx, cy) <= corner
    const o = y * (1 + W * 4) + 1 + x * 4
    const c = rounded ? WHITE : ACCENT
    raw[o] = c[0]
    raw[o + 1] = c[1]
    raw[o + 2] = c[2]
    raw[o + 3] = 255
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0))
])

const out = fileURLToPath(new URL('./icon.png', import.meta.url))
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`icon 已生成: ${out} (${png.length} bytes)`)
