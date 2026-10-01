// adapters/seedance/seedance — 标准镜头语言 JSON ↔ 火山方舟 Doubao-Seedance 请求
// 职责：prompt 转译（两层标准化）、参数映射、计价预估（未校准占位）、错误映射、API 客户端（幂等提交/轮询）。
// 契约驱动：地址/路径/模型家族/入参上限/状态词全部读取同目录 api.json（人类可读面为 overview.md）——
// 官方文档更新时改契约文件即可，不在代码里写死厂商事实。契约维护流程见 ../README.md。

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface ShotJSON {
  shot: {
    index: string
    episode?: string
    subject: string
    /** 出片时长（秒）；缺失用插件/工作区默认。compile 从时间与节奏轴裁出。 */
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

// ---------- 契约装载（运行时读 api.json，不写死厂商事实） ----------

interface SeedanceContract {
  endpoints: {
    baseUrl: string
    baseUrlEnv: string
    paths: { createGeneration: string; getTask: string }
  }
  models: { familyByIdPrefix: Record<string, string> }
  request: {
    promptMaxCharsZh: number
    durationRangeByFamily: Record<string, [number, number]>
    generateAudio: { supportedFamilies: string[] }
    imageCountsByFamily: Record<string, { maxReference: number; maxFirstLastFrame: number }>
    watermarkDefault: boolean
  }
  task: {
    terminal: string[]
    done: string[]
  }
  errors: {
    knownBusinessCodes: Record<string, string>
    http: Record<string, string>
  }
}

const MODULE_DIR = path.dirname(new URL(import.meta.url).pathname)

let _contract: SeedanceContract | null = null
function contract(): SeedanceContract {
  if (_contract) return _contract
  const file = path.join(MODULE_DIR, 'api.json')
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch {
    throw new Error(`seeddance 适配器契约缺失：${file}。api.json 应随包航运（lib/adapters/seedance/api.json），请检查安装。`)
  }
  try {
    _contract = JSON.parse(raw) as SeedanceContract
  } catch {
    throw new Error(`seeddance 适配器契约损坏：${file} 不是合法 JSON。`)
  }
  const missing: string[] = []
  if (!_contract?.endpoints?.baseUrl) missing.push('endpoints.baseUrl')
  if (!_contract?.endpoints?.paths?.createGeneration) missing.push('endpoints.paths.createGeneration')
  if (!_contract?.endpoints?.paths?.getTask) missing.push('endpoints.paths.getTask')
  if (missing.length) throw new Error(`seeddance 适配器契约缺少关键字段：${missing.join('、')}。请核对 api.json 与官方文档。`)
  return _contract
}

/** 覆盖链：config baseUrl > 环境变量 > 契约默认（registry 传入的 config baseUrl 已在调用层第一优先） */
export function defaultBaseUrl(): string {
  const env = process.env[contract().endpoints.baseUrlEnv]
  return env?.trim() || contract().endpoints.baseUrl
}

// ---------- 模型家族 ----------

export type SeedanceFamily = '2.5' | '2.0' | '2.0fast' | '2.0mini' | '1.0pro' | '1.0profast'

/** 按 Model ID 前缀解析家族（最长前缀优先——不依赖 JSON 键插入顺序，任意加行都安全） */
export function familyOf(model: string): SeedanceFamily | null {
  const map = contract().models.familyByIdPrefix
  const keys = Object.keys(map).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (model.startsWith(key)) return map[key] as SeedanceFamily
  }
  // 未登记家族（新家族 / Endpoint ID / 拼写错误）：一律不回退编造值——
  // 由用户在 .dvd.config.json 声明能力（resolveCapabilities），未声明则显式拒绝。
  return null
}

/** 家族 duration 范围（秒）；未登记家族返回 null（不编造兜底值） */
export function durationRangeOf(family: string): [number, number] | null {
  const table = contract().request.durationRangeByFamily as Record<string, [number, number]>
  const range = table[family]
  return range ? [range[0], range[1]] : null
}

// ---------- 家族能力（配置化：用户 .dvd.config.json 声明 > 契约预设，无编造兜底） ----------

/** generate_audio 携带策略：explicit-false=家族支持参数（v1 恒发 false 守无声承诺）；omit=家族无此参数 */
export type AudioPolicy = 'explicit-false' | 'omit'

/** 用户的家族能力声明（.dvd.config.json adapter 条目的 caps 字段；全部可选=已登记家族的部分覆盖） */
export interface CapsOverride {
  /** 时长范围 [最短秒, 最长秒] */
  durationRange?: [number, number]
  /** 参考图上限张数（不支持填 0） */
  maxReferenceImages?: number
  /** 首尾帧上限张数 */
  maxFirstLastFrame?: number
  /** 见 AudioPolicy */
  generateAudio?: AudioPolicy
}

/** 解析后的家族能力（参数闸门的唯一事实源） */
export interface FamilyCaps {
  /** 家族标签（已登记家族名或用户声明值） */
  family: string
  /** preset = 纯契约预设；configured = 含用户声明/覆盖 */
  source: 'preset' | 'configured'
  durationRange: [number, number]
  maxReferenceImages: number
  maxFirstLastFrame: number
  generateAudio: AudioPolicy
}

/** 已登记家族 → 契约预设能力；未登记返回 null（不编造） */
function presetFor(family: string): Omit<FamilyCaps, 'family' | 'source'> | null {
  const range = durationRangeOf(family)
  const images = (contract().request.imageCountsByFamily as Record<string, { maxReference: number; maxFirstLastFrame: number }>)[family]
  if (!range || !images) return null
  const audio: AudioPolicy = contract().request.generateAudio.supportedFamilies.includes(family) ? 'explicit-false' : 'omit'
  return { durationRange: range, maxReferenceImages: images.maxReference, maxFirstLastFrame: images.maxFirstLastFrame, generateAudio: audio }
}

const AUDIO_POLICIES: readonly AudioPolicy[] = ['explicit-false', 'omit']

/** 未登记家族的引导错误（配置化：声明即用，无需插件发版） */
function unknownFamilyError(familyLabel: string | null): string {
  const shown = familyLabel ? `模型家族「${familyLabel}」` : '该模型 ID 的前缀'
  return `${shown}未在契约已登记家族内（可能是新家族、Endpoint ID 或拼写错误）。插件不为未知家族编造参数——请在 .dvd.config.json 该 adapter 条目补能力声明后重试（声明即用，无需等插件发版）：
  "caps": { "durationRange": [4, 15], "maxReferenceImages": 9, "maxFirstLastFrame": 2, "generateAudio": "explicit-false" }
generateAudio 取值：explicit-false（家族支持该参数，v1 恒发 false 保持无声承诺）/ omit（家族不支持该参数，字段不携带）。已登记家族的默认预设见 src/adapters/seedance/overview.md「模型家族」。`
}

/**
 * 解析家族能力：契约预设打底 + 用户声明覆盖。
 * 已登记家族：caps 可整体省略或部分覆盖；未登记家族：caps 四项必须齐备，缺项返回引导错误。
 */
export function resolveCapabilities(
  familyLabel: string | null,
  override?: CapsOverride,
): { caps: FamilyCaps | null; error: string | null } {
  const preset = familyLabel ? presetFor(familyLabel) : null
  if (preset) {
    if (override?.durationRange && override.durationRange[0] > override.durationRange[1]) {
      return { caps: null, error: 'caps.durationRange 无效：需 [最短秒, 最长秒] 且最短 ≤ 最长。' }
    }
    if (override?.generateAudio !== undefined && !AUDIO_POLICIES.includes(override.generateAudio)) {
      return { caps: null, error: `caps.generateAudio 无效：只接受 ${AUDIO_POLICIES.join(' / ')}。` }
    }
    return {
      caps: {
        family: familyLabel!,
        source: override ? 'configured' : 'preset',
        durationRange: override?.durationRange ?? preset.durationRange,
        maxReferenceImages: override?.maxReferenceImages ?? preset.maxReferenceImages,
        maxFirstLastFrame: override?.maxFirstLastFrame ?? preset.maxFirstLastFrame,
        generateAudio: override?.generateAudio ?? preset.generateAudio,
      },
      error: null,
    }
  }
  if (!override) return { caps: null, error: unknownFamilyError(familyLabel) }
  const dr = override.durationRange
  if (!Array.isArray(dr) || dr.length !== 2 || typeof dr[0] !== 'number' || typeof dr[1] !== 'number') {
    return { caps: null, error: unknownFamilyError(familyLabel) + '\n当前声明缺 durationRange（[最短秒, 最长秒]）。' }
  }
  if (dr[0] > dr[1]) return { caps: null, error: `caps.durationRange 无效：最短 ${dr[0]} > 最长 ${dr[1]}。` }
  if (typeof override.maxReferenceImages !== 'number' || override.maxReferenceImages < 0) {
    return { caps: null, error: unknownFamilyError(familyLabel) + '\n当前声明缺 maxReferenceImages（参考图上限张数，不支持填 0）。' }
  }
  if (typeof override.maxFirstLastFrame !== 'number' || override.maxFirstLastFrame < 0) {
    return { caps: null, error: unknownFamilyError(familyLabel) + '\n当前声明缺 maxFirstLastFrame（首尾帧上限张数）。' }
  }
  if (!AUDIO_POLICIES.includes(override.generateAudio as AudioPolicy)) {
    return { caps: null, error: unknownFamilyError(familyLabel) + `\n当前声明缺/误 generateAudio（取值 ${AUDIO_POLICIES.join(' / ')}）。` }
  }
  return {
    caps: {
      family: familyLabel ?? '（用户声明）',
      source: 'configured',
      durationRange: [dr[0], dr[1]],
      maxReferenceImages: override.maxReferenceImages,
      maxFirstLastFrame: override.maxFirstLastFrame,
      generateAudio: override.generateAudio as AudioPolicy,
    },
    error: null,
  }
}

// ---------- 两层标准化转译 ----------

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

/** 厂商层：叙述流单一字符串（官方建议中文 ≤500 字，见契约 promptMaxCharsZh） */
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
  // 超长兜底：官方建议中文 ≤500 字（过量信息分散、成片缺元素）；按「；」边界整体砍尾部子句
  return clampPrompt(text)
}

/** prompt 长度兜底：超限按「；」边界整体砍尾部子句（主体从句在首部，不做字级截断） */
export function clampPrompt(text: string, max = contract().request.promptMaxCharsZh): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSep = cut.lastIndexOf('；')
  return cut.slice(0, lastSep > max * 0.6 ? lastSep : cut.length) + '；'
}

// ---------- 请求体（火山方舟形态） ----------

export type ContentRole = 'first_frame' | 'last_frame' | 'reference_image'

export interface SeedanceContentItem {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string; role?: ContentRole }
}

export interface SeedanceBodyRequest {
  model: string
  content: SeedanceContentItem[]
  resolution?: string
  ratio?: string
  duration: number
  generate_audio?: boolean
  watermark: boolean
}

export interface SeedancePlan {
  /** 厂商 prompt 全文（content 首条 text） */
  vendorPrompt: string
  model: string
  family: string
  duration: number
  resolution: string
  ratio: string
  referenceRoles: string[]
  body: SeedanceBodyRequest
}

/**
 * 参考图输入校验（在 toRequest 之前调用，错误转为中文提示而非异常抛出）。
 * 返回 null = 通过；返回字符串 = 错误说明。
 */
export function validateReferenceInput(modelLabel: string, count: number, referenceMode: boolean, caps: FamilyCaps): string | null {
  if (count === 0) return null
  if (referenceMode) {
    if (caps.maxReferenceImages <= 0) return `模型家族 ${caps.family}（${modelLabel}）不支持参考图（reference_mode 需家族支持参考图）。`
    return count > caps.maxReferenceImages ? `参考图 ${count} 张超过 ${caps.family} 家族上限 ${caps.maxReferenceImages} 张。` : null
  }
  if (count >= 3) {
    if (caps.maxReferenceImages <= 0) return `模型家族 ${caps.family}（${modelLabel}）不支持参考图生视频（3+ 张需家族支持参考图）。`
    return count > caps.maxReferenceImages ? `参考图 ${count} 张超过 ${caps.family} 家族上限 ${caps.maxReferenceImages} 张。` : null
  }
  if (count > caps.maxFirstLastFrame) return `模型家族 ${caps.family}（${modelLabel}）最多支持 ${caps.maxFirstLastFrame} 张首尾帧图片，当前 ${count} 张。`
  return null
}

/** 图 role 分配：reference_mode → 全体参考图；否则 1 张首帧、2 张首尾帧、3+ 张参考图 */
function assignRoles(count: number, referenceMode: boolean): ContentRole[] {
  if (count === 0) return []
  if (referenceMode) return new Array(count).fill('reference_image')
  if (count === 1) return ['first_frame']
  if (count === 2) return ['first_frame', 'last_frame']
  return new Array(count).fill('reference_image')
}

/**
 * 参数映射：标准 JSON + 默认配置 → 火山方舟请求体。
 * 视频家族（2.5/2.0 系列）恒显式 generate_audio=false（v1 无声承诺）；1.0 系列不携带该字段。
 */
export function toRequest(
  shot: ShotJSON,
  opts: {
    model: string
    duration: number
    resolution: '480p' | '720p' | '1080p'
    aspectRatio: string
    referenceMode: boolean
    referenceUrls?: string[]
    /** 已解析的家族能力（resolveCapabilities 产物） */
    caps: FamilyCaps
  },
): SeedancePlan {
  const caps = opts.caps
  const urls = opts.referenceUrls ?? []
  const [dMin, dMax] = caps.durationRange
  const duration = Math.min(dMax, Math.max(dMin, Math.round(opts.duration)))
  const content: SeedanceContentItem[] = []
  let vendorPrompt = clampPrompt(buildVendorPrompt(shot, { photographic: urls.length > 0 }))
  if (shot.prompt_text) vendorPrompt = clampPrompt(vendorPrompt + '；' + shot.prompt_text.trim())
  content.push({ type: 'text', text: vendorPrompt })
  const roles = assignRoles(urls.length, opts.referenceMode)
  urls.forEach((u, i) => content.push({ type: 'image_url', image_url: { url: u, role: roles[i] } }))

  const body: SeedanceBodyRequest = {
    model: opts.model,
    content,
    duration,
    resolution: opts.resolution,
    ratio: opts.aspectRatio,
    watermark: contract().request.watermarkDefault,
  }
  if (caps.generateAudio === 'explicit-false') body.generate_audio = false

  return {
    vendorPrompt,
    model: opts.model,
    family: caps.family,
    duration,
    resolution: opts.resolution,
    ratio: opts.aspectRatio,
    referenceRoles: roles,
    body,
  }
}

// ---------- 计价预估（未校准占位，诚实呈现） ----------

export interface CostEstimate {
  model: string
  family: string
  duration: number
  resolution: string
  /** null = 费率未校准（官方刊例价表尚未补录进 api.json）。预算闸在校准前不拦截。 */
  estimatedCost: number | null
  currency: 'CNY'
  pricingNote: string
  matchedPricing: boolean
}

export function estimate(model: string, duration: number, resolution: string, familyLabel?: string | null): CostEstimate {
  const family = familyLabel ?? familyOf(model) ?? 'unregistered'
  return {
    model, family, duration, resolution,
    estimatedCost: null, // 未校准：方舟无积分 API，刊例价表待补录 api.json 后给出元级预估
    currency: 'CNY',
    pricingNote: '计价未校准占位：方舟按人民币刊例价/秒计费，余额与用量以方舟控制台为准（无积分查询 API）。刊例价表补录进 api.json 后本函数给出元级预估。',
    matchedPricing: false,
  }
}

// ---------- API 客户端 ----------

const USER_AGENT = 'dsh-video-design/0.1.0'

/** 统一 fetch：带超时；超时转可读中文错误 */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error(`${label}请求超时（>${Math.round(timeoutMs / 1000)}s），方舟未响应，稍后重试。`)
    }
    throw err
  }
}

/** 官方错误 → 中文说明（HTTP 语义 + 业务码直读契约表） */
async function mapError(res: Response, body?: any): Promise<Error> {
  let payload: any = body
  if (!payload) {
    try { payload = await res.json() } catch { payload = null }
  }
  const code: string | undefined = (payload as any)?.error?.code ?? (payload as any)?.code
  const message: string | undefined = (payload as any)?.error?.message ?? (payload as any)?.message
  const c = contract()
  const zh = c.errors.http[String(res.status)]
  const biz = code && typeof code === 'string' ? c.errors.knownBusinessCodes[code] : undefined
  const detail = [zh, biz, message].filter(Boolean).join('｜')
  return new Error(detail || (code ? `请求失败（HTTP ${res.status}，${code}）` : `请求失败（HTTP ${res.status}）`))
}

/** 创建任务：POST content generations tasks。官方响应仅含任务 id（无状态字段），归一化为 task_id + queued。 */
export async function createGeneration(
  req: SeedanceBodyRequest,
  apiKey: string,
  base = defaultBaseUrl(),
): Promise<{ task_id: string; status: string }> {
  const c = contract()
  const res = await fetchWithTimeout(`${base}${c.endpoints.paths.createGeneration}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify(req),
  }, 60_000, '创建任务')
  const body = await res.json().catch(() => null)
  if (!res.ok) throw await mapError(res, body)
  const id = (body as any)?.id
  if (!id) throw new Error(`创建任务响应缺少任务 id：${JSON.stringify(body)}`)
  return { task_id: String(id), status: 'queued' }
}

/** 查询任务 GET /api/v3/contents/generations/tasks/{id}（路径形态待官方查询页最终核实，见 overview.md「待补录」） */
export interface SeedanceTask {
  id?: string
  status?: string
  content?: { video_url?: string } | null
  output?: { video_url?: string } | null
  video_url?: string
  error?: { code?: string; message?: string } | null
}

export async function getTask(taskId: string, apiKey: string, base = defaultBaseUrl()): Promise<SeedanceTask> {
  const c = contract()
  const pathTpl = c.endpoints.paths.getTask.replace('{id}', encodeURIComponent(taskId))
  const res = await fetchWithTimeout(`${base}${pathTpl}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'User-Agent': USER_AGENT,
    },
  }, 20_000, '任务查询')
  const body = await res.json().catch(() => null)
  if (!res.ok) throw await mapError(res, body)
  return (body ?? {}) as SeedanceTask
}

/** 成片 URL：契约主位 content.video_url，兼容 output.video_url / 顶层 video_url 兜底 */
export function extractVideoUrl(task?: SeedanceTask | null): string | null {
  if (!task) return null
  return (task.content && task.content.video_url) ?? (task.output && task.output.video_url) ?? task.video_url ?? null
}

export function isTerminalStatus(status?: string): boolean {
  return !!status && contract().task.terminal.includes(status)
}

export function extraDoneStatuses(): string[] {
  return contract().task.done
}

export function extraFailedStatuses(): string[] {
  const c = contract()
  return c.task.terminal.filter(s => !c.task.done.includes(s))
}

// ---------- shot 记录（三份一体：shot / vendor_prompt / meta） ----------

export type RecordStatus = 'pending' | 'done' | 'failed'

export interface ShotRecord {
  shot: ShotJSON
  vendor_prompt: string
  meta: {
    adapter: string
    schema_ver: string
    model: string
    duration: number
    resolution: string
    status?: RecordStatus
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