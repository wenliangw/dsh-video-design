// agent/tools.ts —— v2 工具面（两个工具，别无其他）
//
// shot_gen：提交一次真实生成——纯文本提示词直送用户配置的模型。插件不做任何转译/校验/计价。
// shot_task：查任务进度；终态取片落盘。
// 底线：本文件没有任何模型、任何地址的硬编码——全部来自用户配置（.dvd.config.json 或环境变量）。

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  createGeneration, getTask, isTerminal, downloadVideo, saveFile, buildBody, buildQueryUrl,
} from '../adapters/seedance/seedance.js'
import { resolveConfig, queryUrlError, envWorkspace } from '../workspace/config.js'

/** 实验记录文件顶部目录名 */
const EXPERIMENTS_DIR = 'experiments'

/** 标签白名单（参与文件名，模型输入不可信，防路径穿越） */
const SAFE_LABEL = /^[A-Za-z0-9_-]+$/

function safeLabel(raw?: string): string {
  if (raw && SAFE_LABEL.test(raw)) return raw
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `shot-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/** 实验根目录：配置文件所在目录（没有配置就锚点目录）下的 experiments/ */
function experimentsRoot(anchor: string, configFile: string | null): string {
  const base = configFile ? path.dirname(configFile) : path.resolve(anchor)
  return path.join(base, EXPERIMENTS_DIR)
}

/**
 * 会话工作区：从 execute 上下文取 agent.id → ctx.sessions.get(id).header.cwd
 * （dsh 会话创建时的工作目录，即用户工作区，非进程启动目录）。任何一步取不到
 * （无 agent / 宿主无 sessions 服务 / 会话无 cwd / 非 dsh 宿主）都返回 null，由调用方回退。
 */
export function sessionWorkspace(ctx: Context, exec: unknown): string | null {
  try {
    const agentId = (exec as { agent?: { id?: unknown } })?.agent?.id
    if (typeof agentId !== 'string') return null
    const sessions = (ctx as unknown as { sessions?: { get?: (id: string) => unknown } })?.sessions
    if (!sessions || typeof sessions.get !== 'function') return null
    const cwd = (sessions.get(agentId) as { header?: { cwd?: unknown } } | undefined)?.header?.cwd
    return typeof cwd === 'string' && cwd.length > 0 ? cwd : null
  } catch {
    return null
  }
}

/**
 * 工具目录锚点（优先级从高到低）：
 * 1. SEEDANCE_WORKSPACE 环境变量——用户显式指定的固定视频工作区，任何项目会话里都命中；
 * 2. 会话工作区（dsh 会话创建时的工作目录）——在视频工作区开会话时自然命中；
 * 3. 进程启动目录（测试/直调/无会话兜底）。
 */
export function resolveAnchor(ctx: Context, exec: unknown): { dir: string; source: 'env' | 'session' | 'process' } {
  const env = envWorkspace()
  if (env) return { dir: env, source: 'env' }
  const sess = sessionWorkspace(ctx, exec)
  if (sess) return { dir: sess, source: 'session' }
  return { dir: process.cwd(), source: 'process' }
}

const ANCHOR_SOURCE_LABEL: Record<'env' | 'session' | 'process', string> = {
  env: '环境变量 SEEDANCE_WORKSPACE 指向',
  session: '会话工作区',
  process: '进程启动目录（兜底）',
}

/** 实验记录（三处事实：这镜怎么提的、发给了哪个模型哪个地址、结果在哪 + 人工验收标签） */
export interface ExperimentRecord {
  label: string
  prompt: string
  promptChars: number
  model: string
  createUrl: string
  extra: Record<string, unknown>
  taskId: string
  status: string
  submittedAt: string
  finishedAt?: string
  videoUrl?: string
  mp4File?: string
  lastError?: string
  /** 人工验收：可用 / 不可用（看完片后回填） */
  verdict?: string
  /** 验收原因一句话（失败时可带类别标签，见 docs/h0-experiment.md 评价表） */
  verdictNote?: string
}

export function recordFile(root: string, label: string): string {
  return path.join(root, `${label}.json`)
}

function writeRecord(root: string, record: ExperimentRecord): void {
  saveFile(recordFile(root, record.label), JSON.stringify(record, null, 2))
}

function readRecord(root: string, label: string): ExperimentRecord | null {
  try {
    return JSON.parse(fs.readFileSync(recordFile(root, label), 'utf-8')) as ExperimentRecord
  } catch {
    return null
  }
}

/** 按 taskId 反查记录（同任务 ID 全局唯一） */
function findRecordByTask(root: string, taskId: string): ExperimentRecord | null {
  let files: string[] = []
  try {
    files = fs.readdirSync(root).filter(f => f.endsWith('.json'))
  } catch {
    return null
  }
  for (const f of files) {
    const r = readRecord(root, f.replace(/\.json$/, ''))
    if (r?.taskId === taskId) return r
  }
  return null
}

/** 配置缺失 → 可操作中文报错（不给任何内置默认值，只指路） */
function configError(missing: string[], corrupt: Error | null, configFile: string | null, startDir: string, sourceLabel: string): string | undefined {
  if (corrupt) return `${configFile} 存在但 JSON 损坏：${corrupt.message}——修复后再试。`
  if (!missing.length) return undefined
  const items = missing.map(k => `- ${k}`).join('\n')
  const where = configFile
    ? `${configFile} 已读到，但缺以下字段：`
    : `已从 ${startDir}（${sourceLabel}）向上逐级查找 .dvd.config.json，未找到。文件应包含：{ "apiKey": "...", "model": "...", "createUrl": "创建任务的完整 API 地址", "queryUrl": "查询任务的完整 API 地址模板（含 {task_id} 占位符）" }`
  const hints = configFile ? '' : '\n若这个起点不是你放配置的目录（比如你在别的项目会话里调用本工具）：\n' +
    ' - 设置环境变量 SEEDANCE_WORKSPACE=<你的视频工作区绝对路径>，此后所有会话固定从那里找配置、落实验记录；\n' +
    ' - 或直接在视频工作区对应的目录里开 dsh 会话再调用本工具。'
  return `缺少用户配置（插件不内置任何模型/地址事实，缺什么只列什么）：\n${items}\n${where}\n` +
    '上述四项也可分别用环境变量 SEEDANCE_API_KEY / SEEDANCE_MODEL / SEEDANCE_CREATE_URL / SEEDANCE_QUERY_URL 提供（密钥推荐走环境变量，不进文件）。' + hints
}

export function registerTools(ctx: Context): void {
  // ---- shot_gen — 提交一次真实生成（纯提示词，插件零转译） ----
  ctx.tools.register(defineTool({
    name: 'shot_gen',
    description: 'v2 最小核：把一段纯文本提示词直送用户配置的视频生成模型，发起一次真实生成（花钱）。' +
      '插件不内置任何模型/地址事实——模型、API Key、完整请求地址全部来自用户配置（.dvd.config.json 或环境变量）。' +
      '插件不做校验/转译/计价：提示词一字不改直达模型，费用以后台账单为准。' +
      '每次提交落一条实验记录（experiments/<label>.json），无 API Key 或 dry_run=true 时只预览请求体、不发起。',
    parameters: {
      prompt: { type: 'string', required: true, description: '纯文本提示词，原样直送模型（v2 无转译层，怎么写就怎么送）' },
      label: { type: 'string', description: '实验标签（字母/数字/下划线/连字符，如 h0-simple-25-r1）；缺省自动生成 shot-时间戳' },
      extra: { type: 'string', description: 'JSON 字符串，合并进请求体的其他参数（如 {"duration":5,"resolution":"720p"}）；model 与 content 由插件保持，不可覆盖' },
      dry_run: { type: 'boolean', description: 'true=只预览「将发送的请求体和目标地址」不发起不落盘（默认 false；无 API Key 时强制预览）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: any) => [{ type: 'text', text: value }],
    },
    async execute(args: { prompt: string; label?: string; extra?: string; dry_run?: boolean }, exec: unknown) {
      const { dir: anchor, source } = resolveAnchor(ctx, exec)
      const cfg = resolveConfig(anchor)
      const cfgErr = configError(cfg.missing, cfg.corrupt, cfg.file, anchor, ANCHOR_SOURCE_LABEL[source])
      if (cfgErr) return cfgErr

      const queryErr = queryUrlError(cfg.queryUrl!)
      if (queryErr) return queryErr

      let extra: Record<string, unknown> = {}
      if (args.extra) {
        try {
          extra = JSON.parse(args.extra) as Record<string, unknown>
        } catch {
          return 'extra 不是合法 JSON 字符串。'
        }
      }

      const { body, stripped } = buildBody(cfg.model!, args.prompt, extra)
      const label = safeLabel(args.label)
      const root = experimentsRoot(anchor, cfg.file)

      const preview = [
        '## 🎬 提交预览（真实生成 = 花钱，请确认再提）',
        `**目标**：${cfg.createUrl}`,
        `**模型**：${cfg.model}`,
        `**请求体**：${JSON.stringify(body)}`,
        stripped.length ? `⚠️ extra 里被剥离的字段：${stripped.join('、')}（model/content 由插件保持）` : null,
        `**标签/落点**：${path.join(root, label)}.*`,
        '**费用**：本工具不记账不估费，金额以后台账单为准',
      ].filter(Boolean).join('\n')

      if (args.dry_run === true || !cfg.apiKey) {
        return preview + (cfg.apiKey ? '' : '\n\n（未配置 API Key，仅预览；配好后去掉 dry_run 即真提交。）')
      }

      const submitted = await createGeneration({
        createUrl: cfg.createUrl!,
        apiKey: cfg.apiKey,
        body,
      })
      const record: ExperimentRecord = {
        label,
        prompt: args.prompt,
        promptChars: args.prompt.length,
        model: cfg.model!,
        createUrl: cfg.createUrl!,
        extra: stripped.length ? Object.fromEntries(Object.entries(extra).filter(([k]) => !stripped.includes(k))) : extra,
        taskId: submitted.task_id,
        status: submitted.status,
        submittedAt: new Date().toISOString(),
      }
      writeRecord(root, record)
      return [
        preview,
        '',
        `✅ 已提交，任务编号 ${submitted.task_id}`,
        `实验记录：${recordFile(root, label)}（apiKey 不落盘）`,
        `拿片：调用 shot_task，task_id=${submitted.task_id}（生成中/完成后多查几次）`,
      ].join('\n')
    },
  }))

  // ---- shot_task — 查进度 / 取片 ----
  ctx.tools.register(defineTool({
    name: 'shot_task',
    description: 'v2 查询生成任务进度；成功后下载成片到 experiments/ 并更新实验记录。' +
      '非终态（排队/生成中）时如实返回当前状态，可稍后再查。任务/地址/模型全部来自用户配置与已有实验记录。',
    parameters: {
      task_id: { type: 'string', required: true, description: 'shot_gen 返回的任务编号' },
      label: { type: 'string', description: '落盘标签（缺省从实验记录反查；查不到则用 task_id 作文件名）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: any) => [{ type: 'text', text: value }],
    },
    async execute(args: { task_id: string; label?: string }, exec: unknown) {
      const { dir: anchor } = resolveAnchor(ctx, exec)
      const cfg = resolveConfig(anchor)
      if (!cfg.apiKey || !cfg.queryUrl) {
        return `缺少配置（apiKey/queryUrl），没法查询。${cfg.missing.length ? '当前缺：' + cfg.missing.join('、') : ''}`
      }
      const root = experimentsRoot(anchor, cfg.file)
      const existing = findRecordByTask(root, args.task_id)
      const label = safeLabel(args.label ?? existing?.label ?? args.task_id.replace(/[^A-Za-z0-9_-]/g, '-'))

      const queryUrl = buildQueryUrl(cfg.queryUrl, args.task_id)
      const st = await getTask({ queryUrl, apiKey: cfg.apiKey })

      if (st.status === 'pending') {
        return `任务 ${args.task_id} 无明确状态（响应：${st.raw ?? '空'}）。稍后再查。`
      }

      const touch = (patch: Partial<ExperimentRecord>) => {
        const base = existing ?? {
          label, prompt: '', promptChars: 0, model: cfg.model ?? '', createUrl: cfg.createUrl ?? '',
          extra: {}, taskId: args.task_id, status: 'pending', submittedAt: new Date().toISOString(),
        }
        writeRecord(root, { ...base, ...patch, status: st.status })
      }

      if (st.status === 'failed' || st.status === 'expired') {
        touch({ finishedAt: new Date().toISOString(), lastError: st.raw })
        return `❌ 任务 ${args.task_id} ${st.status === 'failed' ? '失败' : '超时'}。详情：${st.raw ?? '（无）'}。记录已更新：${recordFile(root, label)}`
      }

      if (!isTerminal(st.status)) {
        touch({})
        return `⏳ 任务 ${args.task_id} 当前 ${st.status}（未完成）。稍后再查（生成中/排队中多试几次）。`
      }

      // succeeded：拿片
      if (!st.video_url) {
        touch({ finishedAt: new Date().toISOString(), lastError: '状态 succeeded 但响应里没有 video_url' })
        return `⚠️ 任务 ${args.task_id} 状态 succeeded，但响应里没有成片地址。原文：${st.raw ?? '（空）'}`
      }
      const mp4 = path.join(root, `${label}.mp4`)
      const buf = await downloadVideo(st.video_url)
      saveFile(mp4, buf)
      touch({
        finishedAt: new Date().toISOString(),
        videoUrl: st.video_url,
        mp4File: mp4,
      })
      return `✅ 任务 ${args.task_id} 出片完成：${mp4}（${Math.round(buf.length / 1024)} KB）\n` +
        `实验记录：${recordFile(root, label)}。看完片后告诉我评价（可用/不可用 + 一句原因），我写回实验记录的 verdict/verdictNote 字段。`
    },
  }))
}