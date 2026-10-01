// adapters/seedance/foundation.ts — 四要素基础卡（时间/空间/人物/事件）
// 职责：装载 doctrine/foundation.md 的机器锚 → 泛型校验（必填/枚举/冲突/引用）→ 渲染进厂商 prompt。
// 纪律：机制不写死内容——必填字段、枚举值、冲突规则、zh 标签、示例模板全部来自文件；
//       改文件即改校验（与 11 域封闭轴同一模式：轴值住 md，校验器只做成员判定）。
// 历史事故（我们的青春 EP001）：未定义空间几何 → 「道路纵深 + 横穿动线」违和；未定义人物画面位 → 跨镜位置漂移。

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))

/** 模板根（lib/templates）：src/adapters/seedance 编译后位于 lib/adapters/seedance → 上两级到 lib */
function templatesRoot(): string {
  return path.join(MODULE_DIR, '..', '..', 'templates')
}

// ---------- 类型（四要素骨架 = 机制契约；枚举值 = 文件内容，类型层不写死） ----------

export interface FoundationTime {
  period: string
  lightState?: string
  sequence?: string
}

export interface FoundationSpace {
  location: string
  geometry: { roadDirection: string }
  camera: { side: string; axis?: string }
  traffic: { screenPath: string; note?: string }
  layers?: { supporting?: string; foreground?: string; background?: string; environment?: string }
}

export interface FoundationCharacter {
  id: string
  ref: string
  position: { screen: string; depth: string }
  facing: string
  motion: string
}

export interface FoundationEvent {
  seq: number
  who: string[]
  action: string
  durationSecs?: number
}

export interface Foundation {
  time: FoundationTime
  space: FoundationSpace
  characters: FoundationCharacter[]
  events: FoundationEvent[]
}

// ---------- 规范装载（front-matter 机器锚，缓存） ----------

export type RequiredKind = 'string' | 'number' | 'array' | 'arrayNonEmpty' | 'stringArray'

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
  reservedWho: string[]
  zh: Record<string, Record<string, string>>
  example: Record<string, unknown>
}

let _spec: FoundationSpec | null = null

/** 装载四要素规范（doctrine/foundation.md 的 machine anchor；随包航运，缺失即显式报错） */
export function loadFoundationSpec(): FoundationSpec {
  if (_spec) return _spec
  const file = path.join(templatesRoot(), 'doctrine', 'foundation.md')
  let md: string
  try {
    md = fs.readFileSync(file, 'utf-8')
  } catch {
    throw new Error(`四要素基础卡规范缺失：${file}。foundation.md 应随包航运（lib/templates/doctrine/foundation.md），请检查安装。`)
  }
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(md)
  if (!match) throw new Error(`四要素基础卡规范损坏：${file} 缺少 YAML front-matter。`)
  const data = (yaml.load(match[1]) as Record<string, any>) ?? {}
  const required = (data.required ?? []) as RequiredEntry[]
  if (!Array.isArray(required) || required.length === 0) {
    throw new Error(`四要素基础卡规范损坏：${file} front-matter 缺少 required 清单。`)
  }
  _spec = {
    required,
    enums: (data.enums ?? {}) as Record<string, string[]>,
    conflicts: (data.conflicts ?? []) as ConflictEntry[],
    reservedWho: (data.reservedWho ?? []) as string[],
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
    return ['shot.foundation 缺失——每镜必须声明四要素基础卡（时间/空间/人物/事件是任何镜头的必要定义；没有它，方向词会失去世界语义）。补卡后重提。']
  }
  const record = f as unknown as Record<string, unknown>

  // 1) 必填字段遍历
  for (const entry of spec.required) {
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
    if (entry.kind === 'stringArray') {
      // 每个节点都必须是「非空字符串数组」（events[].who 的 [] 展开后可能有多个 who 数组，逐个查）
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
    if (ids.has(ch.id)) errors.push(`角色编号「${ch.id}」重复——id 必须唯一（events[].who 依赖编号引用）。`)
    ids.add(ch.id)
  }
  const allowed = new Set<string>([...ids, ...spec.reservedWho])
  const events = (record.events as FoundationEvent[]) ?? []
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

  return errors
}

// ---------- 渲染（zh 标签读自规范文件） ----------

export function renderFoundation(f: Foundation): string {
  const spec = loadFoundationSpec()
  const zh = spec.zh
  const pos = (screen: string, depth: string) => {
    const s = zh['characters[].position.screen']?.[screen]
    const d = zh['characters[].position.depth']?.[depth]
    return [s, d].filter(Boolean).join('·')
  }
  const time = ['时间：' + f.time.period, f.time.lightState, f.time.sequence ? `时序：${f.time.sequence}` : '']
    .filter(Boolean).join('，')
  const sp = f.space
  const roadZh = zh['space.geometry.roadDirection']?.[sp.geometry.roadDirection] ?? sp.geometry.roadDirection
  const pathZh = zh['space.traffic.screenPath']?.[sp.traffic.screenPath] ?? sp.traffic.screenPath
  const space = [
    `空间：${sp.location}`,
    roadZh,
    `相机${sp.camera.side}`,
    sp.camera.axis ? `轴线：${sp.camera.axis}` : '',
    `动线：${pathZh}`,
    sp.traffic.note ?? '',
  ].filter(Boolean).join('，')
  const chars = f.characters.length
    ? f.characters.map(c => `${c.ref}（${pos(c.position.screen, c.position.depth)}，${c.facing}，${c.motion}）`).join('；')
    : '无出镜人物'
  const events = f.events.map(e => e.action).join(' → ')
  return `四要素｜${time}｜${space}｜人物：${chars}｜事件：${events}`
}

/** 可复制模板（示例读自规范文件 example；附枚举速查） */
export function foundationTemplate(): string {
  const spec = loadFoundationSpec()
  const legend = Object.entries(spec.enums).map(([p, vs]) => `${p}: ${vs.join('/')}`).join('；')
  const pretty = JSON.stringify(spec.example, null, 2)
  const indented = pretty.split('\n').map((l, i) => (i === 0 ? l : '  ' + l)).join('\n')
  return `{\n  "foundation": ${indented}\n}\n枚举速查：${legend}`
}