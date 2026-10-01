// adapter/registry — 适配器配置解析（.dvd.config.json，按 name 对应）
//
// 设计（用户拍板）：用户视频工作区根放 `.dvd.config.json`，允许配置多个 adapter 条目，
// 条目按 `name` 字段对应。apiKey 为空时回退读环境变量 <NAME大写>_API_KEY（seedance 兼容 SEEDANCE_API_KEY）。
// v1 客户端只实现 seeddance；其它 name 配置了会得到诚实报错（不会静默忽略）。

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface AdapterConfigEntry {
  /** adapter 标识（对应注册表里的客户端实现） */
  name: string
  /** API 基地址；缺省走各客户端内置默认 */
  baseUrl?: string
  /** API key；留空则回退环境变量 */
  apiKey?: string
  /** 模型（必填，无内置默认——模型版本更迭快，插件不为模型改版发版） */
  model?: string
  /** 家族名显式声明（Endpoint ID / 新家族复用某已登记家族预设时使用） */
  family?: string
  /** 家族能力声明（已登记家族可部分覆盖预设；未登记家族四项必须齐备）；generateAudio: explicit-false=家族支持参数（v1 恒发 false）/ omit=无此参数 */
  caps?: CapsConfig
}

/** 用户在配置里的家族能力声明（registry 保持厂商无关；语义校验在客户端 resolveCapabilities） */
export interface CapsConfig {
  /** 时长范围 [最短秒, 最长秒] */
  durationRange?: [number, number]
  /** 参考图上限张数（不支持填 0） */
  maxReferenceImages?: number
  /** 首尾帧上限张数 */
  maxFirstLastFrame?: number
  /** "explicit-false" | "omit" */
  generateAudio?: string
}

export interface AdapterConfigFile {
  adapters: AdapterConfigEntry[]
}

/** 工作区根下的适配器配置文件名 */
export const ADAPTER_CONFIG_FILE = '.dvd.config.json'

/** v1 已实现客户端的 adapter name 集合 */
export const SUPPORTED_ADAPTERS = ['seedance'] as const

/** 默认 adapter（未指明时） */
export const DEFAULT_ADAPTER = 'seedance'

export interface ResolvedAdapter {
  /** 文件里是否配置了该 name 的条目 */
  configured: boolean
  /** .dvd.config.json 存在但 JSON 损坏（解析失败）——用于诚实报错而非「未配置」 */
  corrupt?: boolean
  name: string
  apiKey?: string
  baseUrl?: string
  model?: string
  /** 家族名显式声明（覆盖前缀解析；Endpoint ID / 新家族复用预设） */
  family?: string
  /** 家族能力声明（覆盖契约预设；未登记家族必填） */
  caps?: CapsConfig
}

/** 读工作区的 .dvd.config.json（缺失/损坏返回空集合，不抛；损坏信号走 adapterConfigCorrupt） */
export function loadAdaptersConfig(workspaceRoot: string): AdapterConfigEntry[] {
  try {
    const p = path.join(workspaceRoot, ADAPTER_CONFIG_FILE)
    if (!fs.existsSync(p)) return []
    const data = JSON.parse(fs.readFileSync(p, 'utf-8')) as AdapterConfigFile
    return Array.isArray(data?.adapters) ? data.adapters.filter(e => e && typeof e.name === 'string') : []
  } catch {
    return []
  }
}

/** .dvd.config.json 存在但无法解析（存在但损坏 ≠ 缺失——两者的用户提示必须不同） */
export function adapterConfigCorrupt(workspaceRoot: string): boolean {
  try {
    const p = path.join(workspaceRoot, ADAPTER_CONFIG_FILE)
    if (!fs.existsSync(p)) return false
    JSON.parse(fs.readFileSync(p, 'utf-8'))
    return false
  } catch {
    return true
  }
}

/** 按 name 取条目，并解析最终凭证（文件 apiKey 优先，环境变量兜底） */
export function resolveAdapter(workspaceRoot: string, name: string): ResolvedAdapter {
  const entries = loadAdaptersConfig(workspaceRoot)
  const entry = entries.find(e => e.name === name) ?? null
  const envKey = entry ? entry.apiKey?.trim() : undefined
  const resolved: ResolvedAdapter = {
    configured: !!entry,
    corrupt: adapterConfigCorrupt(workspaceRoot),
    name,
    apiKey: envKey || envApiKey(name),
    baseUrl: entry?.baseUrl?.trim() || undefined,
    // 模型无内置默认：文件 model > <NAME大写>_MODEL 环境变量 > undefined（调用方必须拒绝并指引）
    model: entry?.model?.trim() || envModel(name),
    family: entry?.family?.trim() || undefined,
    caps: entry?.caps,
  }
  return resolved
}

function envApiKey(name: string): string | undefined {
  const macro = name.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  return process.env[`${macro}_API_KEY`]?.trim() || undefined
}

function envModel(name: string): string | undefined {
  const macro = name.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  return process.env[`${macro}_MODEL`]?.trim() || undefined
}

/** 按 name 列出配置概览（供人类快速核对） */
export function describeAdapters(workspaceRoot: string): string {
  const entries = loadAdaptersConfig(workspaceRoot)
  if (entries.length === 0) return `（无 ${ADAPTER_CONFIG_FILE}，仅有环境变量通道）`
  return entries.map(e => {
    const supported = (SUPPORTED_ADAPTERS as readonly string[]).includes(e.name)
    const keyHint = e.apiKey?.trim() ? 'file' : (envApiKey(e.name) ? 'env' : '✗ 未配置')
    const modelHint = e.model?.trim() || envModel(e.name) || '✗ 未设置（无内置默认）'
    const familyHint = e.family?.trim() ? ` family=${e.family.trim()}` : ''
    const capsHint = e.caps ? ' caps=自定义' : ''
    return `- ${e.name}${supported ? '' : '（客户端未实现）'} key=${keyHint} model=${modelHint}${familyHint}${capsHint}`
  }).join('\n')
}