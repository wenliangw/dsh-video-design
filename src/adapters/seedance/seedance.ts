// adapters/seedance/seedance.ts —— 最小调用闭环（只发起、只查询、只下载）
//
// 这里没有任何模型/URL 内置事实：
// - createUrl / queryUrl 是用户配置的完整地址，原样使用（queryUrl 里替换 {task_id}）；
// - model 是用户配置的字符串，原样放进请求体；
// - 请求体形态 = 已验证的厂商形态：{ model, content: [{ type: 'text', text: prompt }] } + 用户 extra 合并。
// 本文件不解释「怎么拍」——纯文本提示词直达模型，一字不改（v2 无转译层）。

import * as fs from 'node:fs'
import * as path from 'node:path'
import { DONE_STATUSES, HTTP_SEMANTICS, TERMINAL_STATUSES } from './contract.js'

/** 请求体（厂商形态，v1 六个真实任务验证） */
export interface GenerationBody {
  model: string
  content: { type: 'text'; text: string }[]
  [key: string]: unknown
}

/** 提交响应：官方仅返回任务 id（归一化为 task_id + pending，本地词） */
export interface SubmitResult {
  task_id: string
  status: string
}

/** 查询响应（提取器兼容官方 content.video_url / output.video_url / 顶层 video_url） */
export interface TaskStatus {
  status: string
  video_url?: string
  raw?: string
}

/** 统一 fetch：超时转可读中文错误 */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error(`${label}请求超时（>${Math.round(timeoutMs / 1000)}s），服务未响应，稍后重试。`)
    }
    throw err
  }
}

/** 服务端错误 → 中文说明（HTTP 语义直读契约表 + 透传服务端原文） */
async function mapError(res: Response, body: unknown): Promise<Error> {
  const payload = (body ?? {}) as Record<string, any>
  const code: string | undefined = payload?.error?.code ?? payload?.code
  const message: string | undefined = payload?.error?.message ?? payload?.message
  const zh = HTTP_SEMANTICS[String(res.status)]
  const detail = [zh, message].filter(Boolean).join('｜')
  return new Error(detail || (code ? `请求失败（HTTP ${res.status}，${code}）` : `请求失败（HTTP ${res.status}）`))
}

/** 提交生成任务：POST 用户配置的完整 createUrl。响应仅含任务 id，归一化为 pending。 */
export async function createGeneration(opts: {
  createUrl: string
  apiKey: string
  body: GenerationBody
}): Promise<SubmitResult> {
  const res = await fetchWithTimeout(opts.createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'dsh-video-design/2.0',
    },
    body: JSON.stringify(opts.body),
  }, 60_000, '创建任务')
  const body = await res.json().catch(() => null)
  if (!res.ok) throw await mapError(res, body)
  const id = (body as any)?.id
  if (!id) throw new Error(`创建任务响应缺少任务 id：${JSON.stringify(body)}`)
  return { task_id: String(id), status: 'pending' }
}

/** 查询任务：GET 用户配置的 queryUrl 模板（{task_id} 已替换） */
export async function getTask(opts: {
  queryUrl: string
  apiKey: string
}): Promise<TaskStatus> {
  const res = await fetchWithTimeout(opts.queryUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'User-Agent': 'dsh-video-design/2.0',
    },
  }, 60_000, '查询任务')
  const body = await res.json().catch(() => null)
  if (!res.ok) throw await mapError(res, body)
  const raw = body as Record<string, any>
  const status = typeof raw?.status === 'string' ? raw.status : undefined
  if (!status) throw new Error(`查询响应缺少状态字段：${JSON.stringify(raw)}`)
  const video = typeof raw?.content?.video_url === 'string' ? raw.content.video_url
    : typeof raw?.output?.video_url === 'string' ? raw.output.video_url
      : typeof raw?.video_url === 'string' ? raw.video_url
        : undefined
  return { status, video_url: video, raw: JSON.stringify(raw) }
}

/** 是否终态／是否成片（词汇读契约表，机制不变量） */
export function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.includes(status)
}
export function isDone(status: string): boolean {
  return DONE_STATUSES.includes(status)
}

/** 下载成片：取 video_url 字节（下载上限 500MB，防异常大文件） */
export async function downloadVideo(videoUrl: string): Promise<Buffer> {
  const res = await fetchWithTimeout(videoUrl, { method: 'GET' }, 120_000, '下载成片')
  if (!res.ok) throw new Error(`成片下载失败：HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > 500 * 1024 * 1024) throw new Error(`成片大小 ${(buf.length / 1048576).toFixed(0)}MB 超过下载上限 500MB。`)
  return buf
}

/** 写文件（出错走异常，由工具层转中文提示） */
export function saveFile(file: string, data: Buffer | string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, data)
}

/** 构建请求体：model+prompt 为骨架；extra 由用户 JSON 合并（body 显式字段不可被覆盖） */
export function buildBody(model: string, prompt: string, extra: Record<string, unknown> = {}): { body: GenerationBody; stripped: string[] } {
  const stripped: string[] = []
  const rest: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(extra)) {
    if (k === 'model' || k === 'content') {
      stripped.push(k)
      continue
    }
    rest[k] = v
  }
  return {
    body: { model, content: [{ type: 'text', text: prompt }], ...rest },
    stripped,
  }
}