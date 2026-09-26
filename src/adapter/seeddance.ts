// adapter/seeddance — 标准镜头语言 JSON ↔ seeddance 厂商请求
// 职责：prompt 转译（两层标准化）、参数映射、计价预估、错误映射、API 客户端（幂等提交/轮询/余额）。
// 查证基准：https://www.seeddance.io/zh/docs/createVideoGeneration

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface ShotJSON {
  shot: {
    index: string
    episode?: string
    subject: string
    /** 出片时长（秒，2–30）；缺失用插件/工作区默认。compile 从时间与节奏轴裁出。 */
    duration?: number
    windows?: { from: string; to: string; movement: string }[]
    axes: Record<string, string>
    cards?: string[]
  }
  prompt_text?: string
  constraints?: { avoid?: string[]; negatives?: string[] }
  materials?: Array<{ entity: string; proposal?: Record<string, any>; confirmed: boolean }>
  meta?: { adapter?: string; schema_ver?: string }
}

export interface SeedanceRequest {
  model: string
  prompt: string
  duration: number
  quality: '480p' | '720p' | '1080p'
  aspect_ratio: string
  generate_audio?: boolean
  image_urls?: string[]
  reference_mode?: boolean
  content_filter?: boolean
}

export interface CostEstimate {
  model: string
  duration: number
  quality: string
  modeFactor: number
  estimatedCredits: number
  pricingNote: string
  /** 计价表是否命中该型号（未命中按 seedance-2.0-fast 兜底，需要提示） */
  matchedModel: boolean
}

const SEEDANCE_BASE = process.env.SEEDANCE_BASE_URL ?? 'https://www.seeddance.io'

// ---- 计价表（占位值，待按官方费率核实后由 _seedance 心法维护） ----
const PRICE = new Map<string, Record<string, number>>([
  ['seedance-1.0-pro-fast', { '480p': 3, '720p': 4, '1080p': 5 }],
  ['seedance-1.5-pro', { '480p': 4, '720p': 5, '1080p': 7 }],
  ['seedance-2.0', { '480p': 5, '720p': 7, '1080p': 10 }],
  ['seedance-2.0-fast', { '480p': 3, '720p': 4, '1080p': 6 }],
  ['seedance-2.0-mini', { '480p': 1, '720p': 2 }],
  ['seedance-2.5', { '480p': 6, '720p': 8, '1080p': 12 }],
])
const PRICING_NOTE = '计价为占位估算（积分/秒），真实费率以开发者账户 getCredits 核实为准。'

/** 计价预估（未知型号按 seedance-2.0-fast 档兜底，matchedModel=false 提示） */
export function estimate(model: string, duration: number, quality: string, modeFactor = 1): CostEstimate {
  const exact = PRICE.get(model)
  const row = exact ?? PRICE.get('seedance-2.0-fast')!
  const perSec = row[quality] ?? row['720p'] ?? 0
  return {
    model, duration, quality, modeFactor,
    estimatedCredits: Math.ceil(duration * perSec * modeFactor),
    pricingNote: PRICING_NOTE,
    matchedModel: exact !== undefined,
  }
}

// ---- 两层标准化转译 ----

/** 标准层：固定子句顺序句子，可倒解析回 11 域（v1 输出结构保留） */
export function buildStandardSentence(shot: ShotJSON): string {
  const { subject, windows, axes } = shot.shot
  const windowText = windows?.length
    ? windows.map(w => `[${w.from}-${w.to}] ${subject}，${w.movement}`).join('；')
    : '[全程] ' + subject
  const clauses: string[] = [windowText]
  for (const key of ['size', 'angle', 'movement', 'composition', 'lighting', 'color', 'pacing', 'vfx']) {
    const v = axes[key]
    if (v) clauses.push(`镜头[${key}]${v}`)
  }
  return clauses.join(' | ')
}

/** 厂商层：叙述流单一字符串（seeddance 只收单一 prompt） */
export function buildVendorPrompt(shot: ShotJSON, opts: { photographic?: boolean } = {}): string {
  const { subject, windows, axes, cards } = shot.shot
  let text: string
  if (windows && windows.length > 1) {
    const numeric = windows.map(w => {
      const from = parseInt(w.from) || 0
      const to = parseInt(w.to) || from + 1
      return { from, to, movement: w.movement }
    })
    text = numeric.map((w, i) => i === 0
      ? `前 ${w.to - w.from} 秒：${subject}，${w.movement}`
      : `随后：${subject}，${w.movement}`).join('；')
  } else {
    text = subject + (windows?.length ? '，' + windows[0].movement : '')
  }
  const extras: string[] = []
  const zh = new Map<string, string>([
    ['size', '景别'], ['angle', '机位'], ['movement', '运镜'], ['composition', '构图'],
    ['lighting', '光线'], ['color', '色调'], ['pacing', '节奏'], ['vfx', '特效'],
    ['sound', '声音'], ['performance', '表演'],
  ])
  for (const [key, value] of Object.entries(axes)) {
    const label = zh.get(key)
    if (label && value) extras.push(`${label}${value}`)
  }
  if (extras.length) text += '；' + extras.join('，')
  if (cards?.length) text += '；手法：' + cards.join('、')
  if (shot.constraints?.negatives?.length) text += '；避免：' + shot.constraints.negatives.join('、')
  if (opts.photographic) text += '；真实摄影质感，电影级光影，避免插画卡通风格'
  // 超长兜底：厂商 prompt 长度有限——尾部整体砍掉（尾部是氛围/特效等补充语，主体在最前）
  return clampPrompt(text)
}

/** prompt 长度兜底：超限按「；」边界整体砍尾部子句（主体从句在首部，不做字级截断） */
export function clampPrompt(text: string, max = 1500): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSep = cut.lastIndexOf('；')
  return cut.slice(0, lastSep > max * 0.6 ? lastSep : cut.length) + '；'
}

/** 参数映射：标准 JSON + 默认配置 → seeddance 请求体 */
export function toRequest(
  shot: ShotJSON,
  opts: {
    model: string
    duration: number
    quality: '480p' | '720p' | '1080p'
    aspectRatio: string
    referenceMode: boolean
    contentFilter: boolean
    referenceUrls?: string[]
  },
): SeedanceRequest {
  const req: SeedanceRequest = {
    model: opts.model,
    prompt: buildVendorPrompt(shot, { photographic: opts.referenceUrls?.length ? true : undefined }),
    duration: opts.duration,
    quality: opts.quality,
    aspect_ratio: opts.aspectRatio,
  }
  // 官方契约：content_filter 是 seedance 2.5 的可选过滤器（默认 true）；仅在显式关闭时携带字段
  if (opts.contentFilter === false) req.content_filter = false
  const refCount = opts.referenceUrls?.length ?? 0
  if (refCount > 0) {
    req.image_urls = opts.referenceUrls
    // 官方契约：reference_mode 仅「2.0 / 2.5」两型号支持（fast/mini 变体未列），且须 1–2 张图片（3+ 张走参考生视频）
    const supportsRefMode = opts.model === 'seedance-2.0' || opts.model === 'seedance-2.5'
    if (opts.referenceMode && refCount >= 1 && refCount <= 2 && supportsRefMode) {
      req.reference_mode = true
    }
  }
  return req
}

// ---- API 客户端 ----

const USER_AGENT = 'dsh-video-design/0.1.0'

/** 统一 fetch：带超时；超时转可读中文错误 */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error(`${label}请求超时（>${Math.round(timeoutMs / 1000)}s），seeddance 未响应，稍后重试。`)
    }
    throw err
  }
}

export async function createGeneration(
  req: SeedanceRequest,
  apiKey: string,
  base = SEEDANCE_BASE,
): Promise<{ task_id: string; status: string }> {
  const res = await fetchWithTimeout(`${base}/v1/videos/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify(req),
  }, 60_000, '创建任务')
  if (!res.ok) throw await mapError(res)
  return (await res.json()) as { task_id: string; status: string }
}

/** 官方 GET /v1/tasks/{task_id} 响应（成片 URL 在 output.video_url；处理中 output 为 null） */
export interface SeedanceTask {
  task_id?: string
  status: string
  model?: string
  output?: { video_url?: string } | null
  /** 兼容读取：部分代理/旧文档抄送顶层字段 */
  video_url?: string
  error?: { code?: string; message?: string } | null
  credits_used?: number
}

/** 从任务响应提取成片 URL（官方层级 output.video_url，顶层兜底） */
export function extractVideoUrl(task: SeedanceTask): string | null {
  return task?.output?.video_url ?? task?.video_url ?? null
}

export async function getTask(
  taskId: string,
  apiKey: string,
  base = SEEDANCE_BASE,
): Promise<SeedanceTask> {
  const res = await fetchWithTimeout(`${base}/v1/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'User-Agent': USER_AGENT },
  }, 20_000, '任务查询')
  if (!res.ok) throw await mapError(res)
  return (await res.json()) as SeedanceTask
}

export async function getCredits(apiKey: string, base = SEEDANCE_BASE): Promise<Record<string, any>> {
  const res = await fetchWithTimeout(`${base}/v1/getCredits`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'User-Agent': USER_AGENT },
  }, 20_000, '余额查询')
  if (!res.ok) throw await mapError(res)
  return (await res.json()) as Record<string, any>
}

const ERROR_ZH: Record<number, string> = {
  400: '请求格式错误（invalid_request）',
  401: 'API key 无效/过期/被吊销——检查 .dvd.config.json 的 adapters[].apiKey 或环境变量 SEEDANCE_API_KEY',
  402: '积分余额不足（insufficient_credits）',
  403: '无权限访问该资源',
  415: 'Content-Type 必须为 application/json',
  422: '参数不合法（模型/时长/画质/画幅超出范围）',
  429: '请求过于频繁，稍后重试',
  500: '服务端错误，稍后重试',
  502: '网关错误，稍后重试',
  503: '服务不可用，稍后重试',
}

async function mapError(res: Response): Promise<Error & { zh: string; code?: string; credits?: string }> {
  let body: any = null
  try { body = await res.json() } catch { /* ignore */ }
  const err = new Error(ERROR_ZH[res.status] ?? `seeddance HTTP ${res.status}`) as Error & { zh: string; code?: string; credits?: string }
  err.zh = err.message
  err.code = body?.error?.code
  if (body?.error?.message) err.message = `${ERROR_ZH[res.status] ?? 'seeddance 错误'}\n${body.error.message}`
  return err
}

// ---- shot 记录落盘（三份）+ 幂等 ----

export interface ShotRecord {
  shot: ShotJSON
  vendor_prompt: string
  meta: {
    adapter: string
    schema_ver: string
    model: string
    duration: number
    quality: string
    status?: 'pending' | 'done' | 'failed'
    task_id?: string
    video_file?: string
    done_at?: string
    /** 最近一次失败原因（video_task 归因时写入） */
    error?: string
    reference_urls?: string[]
    attempts: Array<{ at: string; task_id: string; vendor_prompt: string }>
  }
}

/** 读已有 shot 记录（不存在返回 null） */
export function readShotRecord(file: string): ShotRecord | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as ShotRecord
  } catch {
    return null
  }
}

/** 写 shot 记录（三份一体），幂等由调用方控制（存在且 task_id 未完成则拒绝重写） */
export function writeShotRecord(file: string, record: ShotRecord): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n')
}