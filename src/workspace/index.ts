// workspace/index — 工作区/故事上下文解析与目录骨架
// 目录契约（官方推荐结构）：
//   video-workspace/.dvd（机制 + 工作区级审美） + story-*/（.story 记忆层与 EP00N 同级）
// 层级检测：从 cwd 向上找 .dvd（工作区根）与 .story（故事根）。

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 航运模板根（lib/templates；测试/源码态下=src/templates） */
const SEED_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates')

/** 读航运种子模板（缺失返回 null）——所有种子文案一律来自文件，代码不写死 */
function readSeed(...segments: string[]): string | null {
  try {
    const p = path.join(SEED_ROOT, ...segments)
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null
  } catch {
    return null
  }
}

/** 上下文解析结果 */
export interface VideoContext {
  /** 工作区根（含 .dvd 的目录），无则 null */
  workspaceRoot: string | null
  /** 故事根（含 .story 的目录），无则 null */
  storyRoot: string | null
}

/** 从任意目录向上解析视频上下文 */
export function resolveContext(cwd: string): VideoContext {
  let dir = path.resolve(cwd)
  let workspaceRoot: string | null = null
  let storyRoot: string | null = null
  for (;;) {
    if (!fs.existsSync(dir)) break
    if (!workspaceRoot && fs.existsSync(path.join(dir, '.dvd'))) workspaceRoot = dir
    if (!storyRoot && fs.existsSync(path.join(dir, '.story'))) storyRoot = dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return { workspaceRoot, storyRoot }
}

/** 故事根下的内容目录名（隐藏记忆层） */
export const STORY_META = '.story'
/** 工作区根下的机制目录名 */
export const DVD_META = '.dvd'

const ensureDir = (p: string) => fs.mkdirSync(p, { recursive: true })

/** .dvd/config.json 的行为配置（用户可编辑；非敏感）。生成工具运行时读取（工作区值 > 插件默认） */
export interface WorkspaceBehaviorConfig {
  adapter?: string
  budgetCredits?: number
  defaultDuration?: number
  defaultQuality?: '480p' | '720p' | '1080p' | string
  defaultAspectRatio?: string
}

/** 读工作区行为配置（缺失/损坏返回 {}，绝不抛） */
export function loadWorkspaceConfig(workspaceRoot: string): WorkspaceBehaviorConfig {
  try {
    const p = path.join(workspaceRoot, '.dvd', 'config.json')
    if (!fs.existsSync(p)) return {}
    const data = JSON.parse(fs.readFileSync(p, 'utf-8')) as WorkspaceBehaviorConfig
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

/** .dvd/config.json 存在但解析失败（存在但损坏 ≠ 缺失——后果是静默回退插件默认，可能跨越用户预算，值得告警） */
export function workspaceConfigCorrupt(workspaceRoot: string): boolean {
  try {
    const p = path.join(workspaceRoot, '.dvd', 'config.json')
    if (!fs.existsSync(p)) return false
    JSON.parse(fs.readFileSync(p, 'utf-8'))
    return false
  } catch {
    return true
  }
}

/** 适配器配置文件模板：读航运文件（dvd-config.json）；缺失不播种 */
function adapterConfigTemplate(): string | null {
  return readSeed('workspace', 'dvd-config.json')
}

/** 需要默认忽略的敏感文件（工作区根 .gitignore 条目） */
const SENSITIVE_IGNORE = '.dvd.config.json'

/**
 * 把敏感条目追加进工作区根 .gitignore（幂等：已含该行则不动；追加不触碰已有内容）。
 * 只在工作区首次创建时调用——用户后续自行移除该行 = 明确决定要提交，我们不再加回。
 */
function ensureSensitiveIgnored(workspaceRoot: string): void {
  const gi = path.join(workspaceRoot, '.gitignore')
  const existing = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf-8') : ''
  if (existing.split(/\r?\n/).some(l => l.trim() === SENSITIVE_IGNORE)) return
  const prefix = existing && !existing.endsWith('\n') ? '\n' : ''
  fs.appendFileSync(gi, `${prefix}# dsh-video：适配器 API 凭证（含密钥，默认不进版本库；如确需共享请自行移除此行）\n${SENSITIVE_IGNORE}\n`)
}

/**
 * 在工作区根创建 .dvd 骨架（若不存在）：skills/rules/tastes/db 目录 + config.json。
 * 尊重已有文件（幂等，不覆盖用户编辑）。
 */
export function ensureWorkspaceSkeleton(workspaceRoot: string): boolean {
  const dvd = path.join(workspaceRoot, DVD_META)
  const created = !fs.existsSync(dvd)
  ensureDir(path.join(dvd, 'skills'))
  ensureDir(path.join(dvd, 'rules'))
  ensureDir(path.join(dvd, 'tastes'))
  ensureDir(path.join(dvd, 'db'))
  const cfg = path.join(dvd, 'config.json')
  if (!fs.existsSync(cfg)) {
    fs.writeFileSync(cfg, JSON.stringify({
      // 非敏感行为配置；API 凭证在上级 .dvd.config.json（或环境变量 SEEDANCE_API_KEY）
      adapter: 'seedance',
      budgetCredits: 0,
      defaultDuration: 5,
      defaultQuality: '720p',
      defaultAspectRatio: '16:9',
    }, null, 2) + '\n')
  }
  const adapterCfg = path.join(workspaceRoot, '.dvd.config.json')
  const adapterTpl = adapterConfigTemplate()
  if (!fs.existsSync(adapterCfg) && adapterTpl) fs.writeFileSync(adapterCfg, adapterTpl)
  // 默认防泄露：首次创建时把凭证文件写进工作区根 .gitignore（用户自行移出后不再加回）
  if (created) ensureSensitiveIgnored(workspaceRoot)
  const readme = path.join(workspaceRoot, 'README.md')
  const wsReadme = readSeed('workspace', 'README.md')
  if (!fs.existsSync(readme) && wsReadme) fs.writeFileSync(readme, wsReadme)
  return created
}

/**
 * 创建故事目录骨架：故事根/.story（记忆层）+ EP001/shots（资产）+ AGENTS.md 总纲 + README。
 */
export function ensureStorySkeleton(
  storyRoot: string,
  storyName?: string,
  agentsContent?: string,
): { created: boolean; storyName: string } {
  const exists = fs.existsSync(path.join(storyRoot, STORY_META))
  const name = storyName ?? path.basename(storyRoot)
  const meta = path.join(storyRoot, STORY_META)
  ensureDir(meta)
  // decisions 全量在 .dvd/db（video_remember/video_recall），.story 不落 decision 目录
  for (const sub of ['wiki', 'tastes', 'material', 'corrections']) {
    ensureDir(path.join(meta, sub))
  }
  const overview = path.join(meta, 'overview.md')
  const overviewTpl = readSeed('story', 'overview.md')
  if (!fs.existsSync(overview) && overviewTpl) fs.writeFileSync(overview, overviewTpl)
  const tasteOverview = path.join(meta, 'tastes', 'overview.md')
  const tasteTpl = readSeed('story', 'taste-overview.md')
  if (!fs.existsSync(tasteOverview) && tasteTpl) fs.writeFileSync(tasteOverview, tasteTpl)
  ensureDir(path.join(storyRoot, 'EP001', 'shots'))
  const readme = path.join(storyRoot, 'README.md')
  const readmeTpl = readSeed('story', 'story-readme.md')
  if (!fs.existsSync(readme) && readmeTpl) fs.writeFileSync(readme, readmeTpl.replace('{storyName}', name))
  const agents = path.join(storyRoot, 'AGENTS.md')
  if (!fs.existsSync(agents) && agentsContent) fs.writeFileSync(agents, agentsContent)
  return { created: !exists, storyName: name }
}

/**
 * 复制模板目录（航运资产 → 实例化目录），幂等：已存在的文件不覆盖。
 * pruneLegacy：改名遗留映射 {旧名: 新名}——仅当旧名文件内容与航运新名文件一致（= 我们自己播种的旧副本）时才删除；
 * 内容不同（用户编辑过旧名文件）则保留，绝不静默删用户内容。
 * 返回复制文件数。
 */
export function copyTemplates(srcDir: string, dstDir: string, pruneLegacy: Record<string, string> = {}): number {
  if (!fs.existsSync(srcDir)) return 0
  let count = 0
  const walk = (src: string, dst: string) => {
    ensureDir(dst)
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name)
      const d = path.join(dst, entry.name)
      if (entry.isDirectory()) walk(s, d)
      else if (!fs.existsSync(d)) {
        fs.copyFileSync(s, d)
        count++
      }
    }
  }
  walk(srcDir, dstDir)
  for (const [legacy, current] of Object.entries(pruneLegacy)) {
    const stale = path.join(dstDir, legacy)
    try {
      if (!fs.existsSync(stale)) continue
      const shipped = fs.readFileSync(path.join(srcDir, current), 'utf-8')
      const user = fs.readFileSync(stale, 'utf-8')
      if (user === shipped) fs.rmSync(stale)
    } catch { /* 读失败不删（保守） */ }
  }
  return count
}

/** 目标不存在则播种（幂等；已存在的文件不覆盖——用户编辑优先）。返回是否写入。 */
export function seedFileIfAbsent(dst: string, content: string): boolean {
  if (fs.existsSync(dst)) return false
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.writeFileSync(dst, content)
  return true
}