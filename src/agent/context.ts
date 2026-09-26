// agent/context — 注入文本构建
// 原则：代码不写死任何提示词——所有注入内容一律从文件读（航运母版 / 工作区可编辑副本 / 故事文件）。
// 三块：
//   1. 能力速览（常驻）——航运 CAPABILITIES.md / 工作区 .dvd/capabilities.md（含 dvd 介绍与激活三态）。
//   2. 心法总纲（激活后）——实时读故事根 AGENTS.md；缺失时回退航运 AGENT_TEMPLATE.md。
//   3. Story Context 投影（激活后）——.story 记忆速览 + EP 进度 + 素材/纠错/决策摘要（动态数据，结构标签在代码）。

import * as fs from 'node:fs'
import * as path from 'node:path'
import { getRecentDecisions } from '../db/index.js'

/** 心法总纲注入：实时读故事根 AGENTS.md；缺失/空白时回退航运总纲母版（纯文件驱动） */
export function buildDoctrineGuide(storyRoot: string, shippedTemplate: string): string {
  try {
    const p = path.join(storyRoot, 'AGENTS.md')
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8').trim()
      if (content) return content
    }
  } catch { /* fallthrough */ }
  return shippedTemplate
}

/** 故事概览（.story/overview.md，由主 Agent 维护） */
function readStoryOverview(storyRoot: string): string | null {
  try {
    const p = path.join(storyRoot, '.story', 'overview.md')
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8').trim()
      return content || null
    }
  } catch { /* ignore */ }
  return null
}

/** 故事级品味速览 */
function readTasteOverview(storyRoot: string, workspaceRoot: string | null): string | null {
  const parts: string[] = []
  try {
    if (workspaceRoot) {
      const wp = path.join(workspaceRoot, '.dvd', 'tastes', 'overview.md')
      if (fs.existsSync(wp)) {
        const t = fs.readFileSync(wp, 'utf-8').trim()
        if (t) parts.push('### 工作区底色\n' + t)
      }
    }
    const sp = path.join(storyRoot, '.story', 'tastes', 'overview.md')
    if (fs.existsSync(sp)) {
      const t = fs.readFileSync(sp, 'utf-8').trim()
      if (t) parts.push('### 故事级品味\n' + t)
    }
  } catch { /* ignore */ }
  return parts.length ? parts.join('\n\n') : null
}

/** 素材与纠错索引（目录级：实体清单 + 纠错文件名） */
function readIndexes(storyRoot: string): { material: string[]; corrections: string[] } {
  const list = (dir: string) => {
    try { return fs.readdirSync(path.join(storyRoot, '.story', dir)) } catch { return [] }
  }
  return { material: list('material'), corrections: list('corrections') }
}

/** EP 进度（EP 目录 + shots 数量 + video.mp4 是否成片） */
function readEpisodeProgress(storyRoot: string): Array<{ ep: string; shots: number; hasVideo: boolean }> {
  const eps: Array<{ ep: string; shots: number; hasVideo: boolean }> = []
  try {
    for (const entry of fs.readdirSync(storyRoot)) {
      if (!/^EP\d+$/.test(entry)) continue
      const epDir = path.join(storyRoot, entry)
      const shotsDir = path.join(epDir, 'shots')
      const shots = fs.existsSync(shotsDir)
        ? fs.readdirSync(shotsDir).filter(f => f.endsWith('.json')).length
        : 0
      eps.push({ ep: entry, shots, hasVideo: fs.existsSync(path.join(epDir, 'video.mp4')) })
    }
  } catch { /* ignore */ }
  return eps
}

/** 能力速览注入：内容全部来自文件（工作区 .dvd/capabilities.md 优先，缺失回退航运母版）；文件自带标题，代码不加任何文案 */
export function buildCapabilities(workspaceRoot: string | null, shippedContent: string): string {
  if (workspaceRoot) {
    try {
      const p = path.join(workspaceRoot, '.dvd', 'capabilities.md')
      if (fs.existsSync(p)) {
        const t = fs.readFileSync(p, 'utf-8').trim()
        if (t) return t
      }
    } catch { /* fallthrough */ }
  }
  return shippedContent
}

/** Story Context 投影（激活后每轮注入） */
export function buildStoryContext(
  storyRoot: string,
  workspaceRoot: string | null,
  opts: { maxDecisions?: number } = {},
): string {
  const maxDecisions = opts.maxDecisions ?? 5
  const sections: string[] = []

  const overview = readStoryOverview(storyRoot)
  if (overview) {
    sections.push('## 📋 Story Overview\n' + overview)
    sections.push('')
  }

  const taste = readTasteOverview(storyRoot, workspaceRoot)
  if (taste) {
    sections.push('## 🎨 Story Taste\n' + taste)
    sections.push('')
  }

  const eps = readEpisodeProgress(storyRoot)
  if (eps.length > 0) {
    sections.push('## 🎞 EP 进度\n' + eps.map(e =>
      `- ${e.ep}：${e.shots} 个镜头${e.hasVideo ? '，✅ video.mp4 已合成' : ''}`).join('\n'))
    sections.push('')
  }

  const { material, corrections } = readIndexes(storyRoot)
  if (material.length > 0) {
    sections.push('## 🧩 Material 档案\n' + material.map(m => `- ${m}`).join('\n'))
    sections.push('')
  }
  if (corrections.length > 0) {
    sections.push('## ⚠️ Corrections 纠错\n' + corrections.map(f => `- ${f}`).join('\n'))
    sections.push('')
  }

  const decisions = getRecentDecisions(maxDecisions)
  if (decisions.length > 0) {
    sections.push('## 🔗 Key Decision Chain')
    for (const d of decisions) {
      sections.push(`- **${d.decision}** (${d.outcome})`)
      sections.push(`  Rationale: ${d.rationale}`)
    }
    sections.push('')
  }

  if (sections.length === 0) return ''
  return `## 🎬 Story Context — ${path.basename(storyRoot)}

${sections.join('\n')}`
}