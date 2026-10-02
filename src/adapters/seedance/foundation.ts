// adapters/seedance/foundation.ts — 基础面卡（景→人→交互→动线）
// 职责：装载 doctrine/foundation.md 的机器锚 → 泛型校验（必填/枚举/冲突/引用/持有物重述）→ 渲染进厂商 prompt。
// 纪律：机制不写死内容——必填字段、枚举值、冲突规则、可选块、持有物重述文案、zh 标签、示例模板全部来自文件；
//       改文件即改校验（与 11 域封闭轴同一模式：轴值住 md，校验器只做成员判定）。
// 历史事故（我们的青春 EP001）：未定义空间几何 → 「道路纵深 + 横穿动线」违和；未定义人物画面位 → 跨镜位置漂移；
//       事件未重述持有物 → 人走后车留原地；无三锚无比例声明 → 腿身比例失真。

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))

/** 模板根（lib/templates）：src/adapters/seedance 编译后位于 lib/adapters/seedance → 上两级到 lib */
function templatesRoot(): string {
  return path.join(MODULE_DIR, '..', '..', 'templates')
}

// ---------- 类型（基础面骨架 = 机制契约；枚举值 = 文件内容，类型层不写死） ----------

export interface FoundationAnchors {
  ground: string
  lightSource: string
  scaleRef: string
}

export interface FoundationScene {
  location: string
  period: string
  lightState?: string
  anchors: FoundationAnchors
  geometry: { roadDirection: string }
  camera: { side: string; axis?: string }
  traffic: { screenPath: string; note?: string }
  layers?: { supporting?: string; foreground?: string; background?: string; environment?: string }
}

export interface FoundationCharacter {
  id: string
  ref: string
  /** 骨架比例：相对参照系描述（相对身高/头身比/与道具比例）——数字身高是弱锚 */
  proportions: string
  position: { screen: string; depth: string }
  facing: string
  motion: string
  /** 随身持有物（「道具名（状态）」数组；不携带缺省） */
  props?: string[]
}

export interface FoundationInteraction {
  groundContact: string
  occlusion: string
  scaleRatio: string
  propStates: string
}

export interface FoundationEvent {
  seq: number
  who: string[]
  action: string
  durationSecs?: number
}

export interface FoundationTimeline {
  events: FoundationEvent[]
}

export interface Foundation {
  /** 景块（必填）：场景实体 + 三锚 + 机位世界方位 + 光照时辰 */
  scene: FoundationScene
  /** 人块（必填；空镜可为空数组） */
  characters: FoundationCharacter[]
  /** 交互块（必填）：接触落地/遮挡前后/人-景尺度比/道具恒存态 */
  interaction: FoundationInteraction
  /** 动线块（可选）：事件序列 + 每段重述恒存态；静态/无状态变化镜头整块缺省 */
  timeline?: FoundationTimeline
}

// ---------- 规范装载（front-matter 机器锚，缓存） ----------

export type RequiredKind = 'string' | 'number' | 'array' | 'arrayNonEmpty' | 'stringArray' | 'optionalStringArray'

export interface RequiredEntry {
  path: string
  kind: RequiredKind
  label: string
}

export interface ConflictEntry {
  when: string[]
  message: string
}

export interface FoundationSpec {
  required: RequiredEntry[]
  enums: Record<string, string[]>
  conflicts: ConflictEntry[]
  /** 可整块缺省的顶层块（如 timeline）——块缺失时跳过该块下所有必填项 */
  optionalBlocks: string[]
  reservedWho: string[]
  /** 持有物重述规则文案（占位符：{{ch}} {{prop}} {{action}}） */
  propRestateMessage: string
  zh: Record<string, Record<string, string>>
  example: Record<string, unknown>
}

let _spec: FoundationSpec | null = null

/** 装载基础面规范（doctrine/foundation.md 的 machine anchor；随包航运，缺失即显式报错） */
export function loadFoundationSpec(): FoundationSpec {
  if (_spec) return _spec
  const file = path.join(templatesRoot(), 'doctrine', 'foundation.md')
  let md: string
  try {
    md = fs.readFileSync(file, 'utf-8')
  } catch {
    throw new Error(`基础面卡规范缺失：${file}。foundation.md 应随包航运（lib/templates/doctrine/foundation.md），请检查安装。`)
  }
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(md)
  if (!match) throw new Error(`基础面卡规范损坏：${file} 缺少 YAML front-matter。`)
  const data = (yaml.load(match[1]) as Record<string, any>) ?? {}
  const required = (data.required ?? []) as RequiredEntry[]
  if (!Array.isArray(required) || required.length === 0) {
    throw new Error(`基础面卡规范损坏：${file} front-matter 缺少 required 清单。`)
  }
  _spec = {
    required,
    enums: (data.enums ?? {}) as Record<string, string[]>,
    conflicts: (data.conflicts ?? []) as ConflictEntry[],
    optionalBlocks: (data.optionalBlocks ?? []) as string[],
    reservedWho: (data.reservedWho ?? []) as string[],
    propRestateMessage: (data.propRestateMessage ?? '事件未重述持有物「{{prop}}」（角色 {{ch}}）') as string,
    zh: (data.zh ?? {}) as Record<string, Record<string, string>>,
    example: (data.example ?? {}) as Record<string, unknown>,
  }
  return _spec
}

// ---------- 路径求值（点分层 + [] 数组展开） ----------

function getPath(obj: unknown, p: string): unknown[] {
  let nodes: unknown[] = [obj]
  for (const part of p.split('.')) {
    const isArray = part.endsWith('[]')
    const key = isArray ? part.slice(0, -2) : part
    const next: unknown[] = []
    for (const node of nodes) {
      if (node === null || node === undefined || typeof node !== 'object') continue
      const v = (node as Record<string, unknown>)[key]
      if (isArray) {
        if (Array.isArray(v)) next.push(...v)
      } else {
        next.push(v)
      }
    }
    nodes = next
  }
  return nodes
}

// ---------- 校验（全部规则读自规范文件） ----------

export function validateFoundation(f: Foundation | null | undefined): string[] {
  const spec = loadFoundationSpec()
  const errors: string[] = []
  if (!f || typeof f !== 'object') {
    return ['shot.foundation 缺失——每镜必须声明基础面卡（景→人→交互→动线：先立景、再入人、再定交互、可选加动线）。没有它，方向词会失去世界语义。补卡后重提。']
  }
  const record = f as unknown as Record<string, unknown>

  // 1) 必填字段遍历（可选块缺失时跳过该块下所有必填项）
  for (const entry of spec.required) {
    const block = entry.path.split('.')[0]
    if (spec.optionalBlocks.includes(block)) {
      const present = record[block] !== undefined && record[block] !== null
      if (!present) continue
    }
    const nodes = getPath(record, entry.path)
    if (entry.kind === 'array' || entry.kind === 'arrayNonEmpty') {
      const arr = nodes[0]
      if (!Array.isArray(arr)) {
        errors.push(`${entry.label}（${entry.path}）缺失或不是数组。`)
        continue
      }
      if (entry.kind === 'arrayNonEmpty' && arr.length === 0) {
        errors.push(`${entry.label}（${entry.path}）不能为空数组。`)
      }
      continue
    }
    if (entry.kind === 'optionalStringArray') {
      // 可选字段：角色未声明持有物（节点缺失）合法；声明则必须是「名（状态）」非空字符串数组
      for (const nd of nodes) {
        if (nd === undefined || nd === null) continue
        if (!Array.isArray(nd) || nd.length === 0 || !nd.every((x): x is string => typeof x === 'string' && x.trim() !== '')) {
          errors.push(`${entry.label}（${entry.path}）形态不符：应为「道具名（状态）」字符串数组，不携带则整字段缺省。`)
          break
        }
      }
      continue
    }
    if (entry.kind === 'stringArray') {
      // 每个节点都必须是「非空字符串数组」（timeline.events[].who 的 [] 展开后可能有多个 who 数组，逐个查）
      const ok = nodes.every(nd => Array.isArray(nd) && nd.every((x): x is string => typeof x === 'string' && x.trim() !== ''))
      if (!ok) {
        errors.push(`${entry.label}（${entry.path}）缺失、非数组或含空项/非字符串。`)
      }
      continue
    }
    if (entry.kind === 'number') {
      const bad = nodes.filter(v => typeof v !== 'number' || !Number.isFinite(v))
      if (bad.length) errors.push(`${entry.label}（${entry.path}）缺失或不是数值。`)
      continue
    }
    // kind === 'string'：每个节点都必须是非空字符串
    if (nodes.length === 0) {
      // 数组元素路径 + 空数组 = 空真（空镜 characters=[] 不应触发 characters[].id 报错）
      if (entry.path.includes('[]')) continue
      errors.push(`${entry.label}（${entry.path}）缺失。`)
      continue
    }
    const bad = nodes.filter(v => typeof v !== 'string' || v.trim() === '')
    if (bad.length) errors.push(`${entry.label}（${entry.path}）缺失或为空。`)
  }

  // 2) 枚举成员校验
  for (const [p, values] of Object.entries(spec.enums)) {
    for (const v of getPath(record, p)) {
      if (v === undefined || v === null || v === '') {
        errors.push(`枚举字段 ${p} 缺失（允许值：${values.join(' / ')}）。`)
      } else if (typeof v === 'string' && !values.includes(v)) {
        errors.push(`枚举字段 ${p} 非法值「${v}」（允许值：${values.join(' / ')}）。`)
      }
    }
  }

  // 3) 冲突规则求值（when 全部条件命中才报错）
  for (const c of spec.conflicts) {
    const hit = c.when.every(cond => {
      const idx = cond.lastIndexOf('==')
      if (idx < 0) return false
      const p = cond.slice(0, idx)
      const expected = cond.slice(idx + 2)
      const nodes = getPath(record, p)
      return nodes.length === 1 && nodes[0] === expected
    })
    if (hit) errors.push(c.message)
  }

  // 4) 角色编号唯一 + 事件序号唯一 + who 引用范围
  const chars = (record.characters as FoundationCharacter[]) ?? []
  const ids = new Set<string>()
  for (const ch of chars) {
    if (!ch || typeof ch.id !== 'string' || ch.id.trim() === '') continue
    if (ids.has(ch.id)) errors.push(`角色编号「${ch.id}」重复——id 必须唯一（timeline.events[].who 依赖编号引用）。`)
    ids.add(ch.id)
  }
  const allowed = new Set<string>([...ids, ...spec.reservedWho])
  const events = ((record.timeline as FoundationTimeline | undefined)?.events ?? []) as FoundationEvent[]
  const seqs = new Set<number>()
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue
    if (typeof ev.seq === 'number') {
      if (seqs.has(ev.seq)) errors.push(`事件序号 ${ev.seq} 重复——seq 必须唯一。`)
      seqs.add(ev.seq)
    }
    if (Array.isArray(ev.who)) {
      for (const w of ev.who) {
        if (typeof w !== 'string' || !allowed.has(w)) {
          errors.push(`事件《${ev.action ?? ''}》的 who「${String(w)}」未在 characters 声明（或非保留词 ${spec.reservedWho.join('/')}）。`)
        }
      }
    }
  }

  // 5) 持有物重述：props 声明的每个道具，该角色出场的每个事件动作都必须重述道具名（历史事故：S006 人走后车留原地）
  const fmt = (tpl: string, m: Record<string, string>) =>
    tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => m[k] ?? '')
  for (const ch of chars) {
    if (!ch || !Array.isArray(ch.props) || typeof ch.id !== 'string') continue
    for (const p of ch.props) {
      if (typeof p !== 'string') continue
      const name = (p.split('（')[0] ?? p).trim()
      if (!name) continue
      for (const ev of events) {
        if (!ev || !Array.isArray(ev.who) || !ev.who.includes(ch.id)) continue
        if (typeof ev.action !== 'string' || !ev.action.includes(name)) {
          errors.push(fmt(spec.propRestateMessage, { ch: ch.ref ?? ch.id, prop: name, action: ev.action ?? '' }))
        }
      }
    }
  }

  return errors
}

// ---------- 渲染（zh 标签读自规范文件；顺序 = 景→人→交互→动线） ----------

export function renderFoundation(f: Foundation): string {
  const spec = loadFoundationSpec()
  const zh = spec.zh
  const pos = (screen: string, depth: string) => {
    const s = zh['characters[].position.screen']?.[screen]
    const d = zh['characters[].position.depth']?.[depth]
    return [s, d].filter(Boolean).join('·')
  }
  const sc = f.scene
  const roadZh = zh['scene.geometry.roadDirection']?.[sc.geometry.roadDirection] ?? sc.geometry.roadDirection
  const pathZh = zh['scene.traffic.screenPath']?.[sc.traffic.screenPath] ?? sc.traffic.screenPath
  const sceneParts = [
    `景：${sc.location}`,
    sc.period,
    sc.lightState ?? '',
    `地面${sc.anchors.ground}`,
    `光源${sc.anchors.lightSource}`,
    `尺度参照${sc.anchors.scaleRef}`,
    roadZh,
    `相机${sc.camera.side}`,
    sc.camera.axis ?? '',
    `动线${pathZh}`,
    sc.traffic.note ?? '',
  ].filter(Boolean)
  const chars = f.characters.length
    ? f.characters.map(c => {
        const carried = c.props?.length ? `持${c.props.join('、')}` : ''
        return `${c.ref}(身比${c.proportions}·${pos(c.position.screen, c.position.depth)}·${c.facing}·${c.motion}${carried ? '·' + carried : ''})`
      }).join('；')
    : '无出镜人物'
  const ia = f.interaction
  const interactionPart = `交互：落地${ia.groundContact}·遮挡${ia.occlusion}·尺度比${ia.scaleRatio}·恒存${ia.propStates}`
  const evs = f.timeline?.events ?? []
  const timelinePart = evs.length ? `动线：${evs.map(e => e.action).join('→')}` : '动线：静态无事件'
  return `基础面｜${sceneParts.join('·')}｜人：${chars}｜${interactionPart}｜${timelinePart}`
}

/** 可复制模板（示例读自规范文件 example；附枚举速查） */
export function foundationTemplate(): string {
  const spec = loadFoundationSpec()
  const legend = Object.entries(spec.enums).map(([p, vs]) => `${p}: ${vs.join('/')}`).join('；')
  const pretty = JSON.stringify(spec.example, null, 2)
  const indented = pretty.split('\n').map((l, i) => (i === 0 ? l : '  ' + l)).join('\n')
  return `{\n  "foundation": ${indented}\n}\n枚举速查：${legend}`
}