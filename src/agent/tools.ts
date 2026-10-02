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
import { resolveConfig, queryUrlError } from '../workspace/config.js'

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

/** 实验根目录：工作区根（找不到标记则退回起点目录）下的 experiments/ */
function experimentsRoot(workspaceRoot: string | null, startDir: string): string {
  return path.join(workspaceRoot ?? path.resolve(startDir), EXPERIMENTS_DIR)
}

/**
 * 会话工作区【宿主源码考证事实，非猜测】：
 *   exec.agent?.session?.header?.cwd
 * 类型定义链（全部在已安装宿主包里有明文）：
 *   ToolRunContext.agent?: Agent —— "set by the agent loop"（@deepseek-ai/dsh-tools）
 *   Agent.session: Session —— 活会话对象直接挂在 agent 上（@deepseek-ai/dsh-agent runtime-types）
 *   Session.header: SessionHeader —— "always present"（@deepseek-ai/dsh-session）
 *   SessionHeader.cwd?: string —— "Absolute working directory the session was created in (if any)"
 * 即「会话创建时的工作目录」= 用户在哪个工作区开的这个会话。
 * v1 master 源码注释佐证：「工具侧没有 agent 引用时，用 process.cwd() 兜底」——
 * master 作者当时想要的就是会话引用，只是工具侧拿不到；现宿主已投递，直接使用。
 * 任何一步缺失/异常 → null，调用方回退 process.cwd()。
 */
export function sessionWorkspace(exec: unknown): string | null {
  try {
    const agent = (exec as { agent?: { session?: { header?: { cwd?: unknown } } } } | undefined)?.agent
    const cwd = agent?.session?.header?.cwd
    return typeof cwd === 'string' && cwd.length > 0 ? cwd : null
  } catch {
    return null
  }
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

/** 配置缺失 → 可操作中文报错（不给任何内置默认值，只指路）；startLabel 说明查找起点来源（会话工作区/进程兜底） */
function configError(missing: string[], corrupt: Error | null, workspaceRoot: string | null, file: string | null, cwd: string, startLabel: string): string | undefined {
  if (corrupt) return `${file} 存在但 JSON 损坏：${corrupt.message}——修复后再试。`
  if (!missing.length) return undefined
  const items = missing.map(k => `- ${k}`).join('\n')
  const where = workspaceRoot
    ? (file
      ? `${file} 已读到，但缺以下字段：`
      : `工作区根 ${workspaceRoot} 下没有 .dvd.config.json。该文件应包含：{ "apiKey": "...", "model": "...", "createUrl": "创建任务的完整 API 地址", "queryUrl": "查询任务的完整 API 地址模板（含 {task_id} 占位符）" }`)
    : `已从 ${cwd}（${startLabel}）向上逐级查找工作区标记目录 .dvd，未找到——当前不在视频工作区内。请在视频工作区（含 .dvd 目录）里开 dsh 会话再调用本工具。`
  return `缺少用户配置（插件不内置任何模型/地址事实，缺什么只列什么）：\n${items}\n${where}\n` +
    '上述四项也可分别用环境变量 SEEDANCE_API_KEY / SEEDANCE_MODEL / SEEDANCE_CREATE_URL / SEEDANCE_QUERY_URL 提供（密钥推荐走环境变量，不进文件）。'
}

export function registerTools(ctx: Context): void {
  // ---- shot_gen — 提交一次真实生成（纯提示词，插件零转译） ----
  ctx.tools.register(defineTool({
    name: 'shot_gen',
    description: 'v2 最小核：把一段纯文本提示词直送用户配置的视频生成模型，发起一次真实生成（花钱）。' +
      '插件不内置任何模型/地址事实——模型、API Key、完整请求地址全部来自用户配置（.dvd.config.json 或环境变量）。' +
      '插件不做校验/转译/计价：提示词一字不改直达模型，费用以后台账单为准。' +
      '每次提交落一条实验记录（experiments/<label>.json），无 API Key 或 dry_run=true 时只预览请求体、不发起。' +
      '起草提示词前必须先加载 skill video-shot-prompt 并按它的自检清单逐项自查。',
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
      const start = sessionWorkspace(exec)
      const startLabel = start ? '会话工作区' : '服务器进程目录（兜底）'
      const startDir = start ?? process.cwd()
      const cfg = resolveConfig(startDir)
      const cfgErr = configError(cfg.missing, cfg.corrupt, cfg.workspaceRoot, cfg.file, startDir, startLabel)
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
      const root = experimentsRoot(cfg.workspaceRoot, startDir)

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
      const startDir = sessionWorkspace(exec) ?? process.cwd()
      const cfg = resolveConfig(startDir)
      if (!cfg.apiKey || !cfg.queryUrl) {
        return `缺少配置（apiKey/queryUrl），没法查询。${cfg.missing.length ? '当前缺：' + cfg.missing.join('、') : ''}`
      }
      const root = experimentsRoot(cfg.workspaceRoot, startDir)
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