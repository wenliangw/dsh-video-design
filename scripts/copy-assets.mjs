// scripts/copy-assets.mjs — 复制静态资产（doctrine 能力库 + skills 心法 + AGENTS 总纲模板）到 lib
// tsc 只编译 .ts，不复制 .md/.json 等静态资源，这里手动复制。

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const srcTemplates = path.join(root, 'src', 'templates')
const dstTemplates = path.join(root, 'lib', 'templates')

if (!fs.existsSync(srcTemplates)) {
  console.log('[copy-assets] src/templates 不存在，跳过')
  process.exit(0)
}

fs.mkdirSync(dstTemplates, { recursive: true })

let count = 0

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const dstPath = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath)
    } else {
      fs.copyFileSync(srcPath, dstPath)
      count++
    }
  }
}

copyDir(srcTemplates, dstTemplates)

console.log(`[copy-assets] 复制 ${count} 个模板文件到 lib/templates/`)

// ---- 适配器契约资产（src/adapters/**/{*.md,*.json} → lib/adapters/；.ts 由 tsc 编译，不在此复制） ----
const srcAdapters = path.join(root, 'src', 'adapters')
const dstAdapters = path.join(root, 'lib', 'adapters')
if (fs.existsSync(srcAdapters)) {
  let adapterCount = 0
  function copyAdapters(src, dst) {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name)
      const dstPath = path.join(dst, entry.name)
      if (entry.isDirectory()) {
        copyAdapters(srcPath, dstPath)
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.json')) {
        fs.mkdirSync(path.dirname(dstPath), { recursive: true })
        fs.copyFileSync(srcPath, dstPath)
        adapterCount++
      }
    }
  }
  copyAdapters(srcAdapters, dstAdapters)
  console.log(`[copy-assets] 复制 ${adapterCount} 个适配器契约文件到 lib/adapters/`)
}