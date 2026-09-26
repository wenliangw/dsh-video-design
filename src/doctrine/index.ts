// doctrine/index — 官方能力库装载器
// 三阶层：词汇轴（11 域，双面 md）+ 手法卡片 + 组合包。
// 资产来源 = lib/templates/doctrine/（构建期由 copy-assets 复制），
// md 形态：YAML front-matter（机器锚）+ 正文（LLM 血肉）。

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))

/** 模板根（lib/templates） */
function templatesRoot(): string {
  // src/doctrine 编译后位于 lib/doctrine
  return path.join(MODULE_DIR, '..', 'templates')
}

/** 解析双面 md 的 YAML front-matter；无 front-matter 返回 {} */
export function parseFrontmatter(md: string): { data: Record<string, any>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(md)
  if (!m) return { data: {}, body: md }
  const data = (yaml.load(m[1]) as Record<string, any>) ?? {}
  return { data, body: md.slice(m[0].length) }
}

export interface AxisValue {
  id: string
  zh: string
  tags?: string[]
}

export interface Axis {
  key: string
  label: string
  kind: 'closed' | 'open'
  values: AxisValue[]
}

export interface Card {
  id: string
  name: string
  summary: string
  recipe: Record<string, string>
  emotionTags: string[]
  example: string
  provenance: 'official' | 'project'
  body: string
}

export interface Preset {
  id: string
  name: string
  summary: string
  cards: string[]
  emotionTags: string[]
  /** 组合包的轴值叠加配方（selected 轴值并集，如 size: LS / color: teal-orange） */
  recipe: Record<string, string>
  body: string
}

function readAll(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => f.endsWith('.md'))
}

/** 装载 11 域词汇轴 */
export function loadAxes(root = templatesRoot()): Axis[] {
  const dir = path.join(root, 'doctrine', 'axes')
  const result: Axis[] = []
  for (const file of readAll(dir).sort()) {
    const { data } = parseFrontmatter(fs.readFileSync(path.join(dir, file), 'utf-8'))
    if (!data.key) continue
    result.push({
      key: data.key,
      label: data.label ?? data.key,
      kind: data.kind === 'open' ? 'open' : 'closed',
      values: (data.values ?? []).map((v: any) => ({
        id: v.id, zh: v.zh ?? v.id, tags: v.tags,
      })),
    })
  }
  return result
}

/** 装载手法卡片 */
export function loadCards(root = templatesRoot()): Card[] {
  const dir = path.join(root, 'doctrine', 'cards')
  const result: Card[] = []
  for (const file of readAll(dir)) {
    const { data, body } = parseFrontmatter(fs.readFileSync(path.join(dir, file), 'utf-8'))
    if (!data.id) continue
    result.push({
      id: data.id,
      name: data.name ?? data.id,
      summary: data.summary ?? '',
      recipe: data.recipe ?? {},
      emotionTags: data.emotion_tags ?? data.tags ?? [],
      example: data.example ?? '',
      provenance: data.provenance === 'project' ? 'project' : 'official',
      body: body.trim(),
    })
  }
  return result
}

/** 装载组合包 */
export function loadPresets(root = templatesRoot()): Preset[] {
  const dir = path.join(root, 'doctrine', 'presets')
  const result: Preset[] = []
  for (const file of readAll(dir)) {
    const { data, body } = parseFrontmatter(fs.readFileSync(path.join(dir, file), 'utf-8'))
    if (!data.id) continue
    result.push({
      id: data.id,
      name: data.name ?? data.id,
      summary: data.summary ?? '',
      cards: data.cards ?? [],
      emotionTags: data.emotion_tags ?? [],
      recipe: data.recipe && typeof data.recipe === 'object' ? data.recipe : {},
      body: body.trim(),
    })
  }
  return result
}

/** 对标准镜头语言的 axes 做封闭枚举校验（开放成长轴不拦未知值） */
export function validateAxes(axes: Record<string, string> | undefined, all: Axis[]): string[] {
  const errors: string[] = []
  if (!axes) return errors
  const byKey = new Map(all.map(a => [a.key, a]))
  for (const [key, value] of Object.entries(axes)) {
    const axis = byKey.get(key)
    if (!axis) {
      errors.push(`未知轴 "${key}"`)
      continue
    }
    if (axis.kind !== 'closed') continue
    if (!axis.values.some(v => v.id === value)) {
      errors.push(`轴 "${key}"(${axis.label}) 的值 "${value}" 非法，允许：${axis.values.map(v => v.id).join('/')}`)
    }
  }
  return errors
}

/** 按情绪标签找卡片（选项化抽样源） */
export function findCardsByEmotion(cards: Card[], tag: string, limit = 4): Card[] {
  return cards.filter(c => c.emotionTags.includes(tag)).slice(0, limit)
}