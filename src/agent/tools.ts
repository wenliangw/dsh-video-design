// agent/tools — dsh-video 工具面
// video_init（工作区/故事初始化）/ video_view（故事全景）/ video_remember / video_recall（决策链）
// generate_shot（校验→dry-run 转译计价→幂等出片）/ video_task（任务进度/取片）/ svg_render（SVG→PNG）
//
// 工具均带 video 前缀或领域名，避免与 dsh-mesync 的 recall/remember/reality 同名。

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  resolveContext, ensureWorkspaceSkeleton, ensureStorySkeleton, copyTemplates, seedFileIfAbsent,
  loadWorkspaceConfig, workspaceConfigCorrupt, type VideoContext,
} from '../workspace/index.js'
import { loadAxes, validateAxes } from '../doctrine/index.js'
import {
  estimate, buildStandardSentence, buildVendorPrompt, toRequest,
  createGeneration, getTask, getCredits,
  readShotRecord, writeShotRecord, extractVideoUrl,
  type ShotJSON, type ShotRecord,
} from '../adapter/seeddance.js'
import {
  resolveAdapter, describeAdapters, SUPPORTED_ADAPTERS, DEFAULT_ADAPTER,
} from '../adapter/registry.js'
import {
  initDB, registerStory, listStories,
  insertDecision, getRecentDecisions, searchDecisions, getDecisionById, updateDecisionOutcome,
  type DecisionNode,
} from '../db/index.js'
import type { Config } from '../config/index.js'

/** 当前活跃上下文（events 在 session-start 设置） */
let currentContext: VideoContext | null = null

export function setCurrentContext(ctx: VideoContext | null): void {
  currentContext = ctx
}

/** 读当前活跃上下文（注入面 text() 动态解析用） */
export function peekVideoContext(): VideoContext | null {
  return currentContext
}

/** shot 文件名/EP 目录名白名单（防路径穿越：模型产出的 index/episode 参与 path.join） */
const SAFE_INDEX = /^[A-Za-z0-9_-]+$/
const SAFE_EP = /^EP\d+$/

function safeEpisode(ep?: string): string {
  return ep && SAFE_EP.test(ep) ? ep : 'EP001'
}

/** 同 shot 进程内互斥（check-then-act 竞态：两个并行 generate_shot 同 index 都通过幂等检查 → 双 POST 双扣费） */
const shotLocks = new Map<string, Promise<unknown>>()

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = shotLocks.get(key) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  const tail = run.catch(() => undefined)
  shotLocks.set(key, tail)
  return run.finally(() => {
    if (shotLocks.get(key) === tail) shotLocks.delete(key)
  })
}

const MAX_MP4_BYTES = 500 * 1024 * 1024 // 成片下载上限 500MB

/** 解析 cwd（工具侧没有 agent 引用时，用 process.cwd() 兜底） */
function effectiveContext(): VideoContext {
  if (currentContext?.storyRoot || currentContext?.workspaceRoot) return currentContext
  return resolveContext(process.cwd())
}

/** 决策格式化（摘要一行） */
function formatSummary(d: DecisionNode): string {
  const scopes = d.scopes?.length ? ` [${d.scopes.join(', ')}]` : ''
  return `- ${d.id} · **${d.decision}** (${d.outcome})${scopes}`
}

/** 航运模板根（lib/templates） */
function templatesRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  return path.join(moduleDir, '..', 'templates')
}

/** 时长归一：shot.duration > 工作区默认 > 插件默认；钳到 2–30 秒 */
function clampDuration(raw?: number, ws?: number, fallback = 5): number {
  const n = Number.isFinite(raw) && (raw as number) > 0
    ? (raw as number)
    : (Number.isFinite(ws) && (ws as number) > 0 ? (ws as number) : fallback)
  return Math.min(30, Math.max(2, Math.round(n)))
}

/** 读航运能力速览母版（缺失返回空串） */
function readCapabilitiesTemplate(): string {
  try {
    const p = path.join(templatesRoot(), 'agents', 'CAPABILITIES.md')
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : ''
  } catch {
    return ''
  }
}

export function registerTools(ctx: Context, config: Config): void {
  // ---- video_init — 创建视频工作区/故事 ----
  ctx.tools.register(defineTool({
    name: 'video_init',
    description: '创建 dsh-video 视频工作区/故事目录骨架（激活三态①：用户确认后调用）。' +
      '在目标根目录创建 .dvd（机制+工作区审美+配置）与指定故事目录（.story 记忆层 + EP001 资产 + AGENTS.md 心法总纲），' +
      '并把航运心法 skills 实例化进 .dvd/skills。幂等：已存在的文件不覆盖。',
    parameters: {
      story: { type: 'string', required: true, description: '故事目录名（如 story-林小满），将在工作区根下创建' },
      workspace: { type: 'string', description: '工作区根目录；默认当前上下文的工作区根，无则当前 cwd' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: any) => [{ type: 'text', text: value }],
    },
    async execute(args: { story: string; workspace?: string }, _exec: any) {
      const vctx = effectiveContext()
      const workspaceRoot = path.resolve(args.workspace ?? vctx.workspaceRoot ?? process.cwd())
      if (!/^[\w\u4e00-\u9fa5-]+$/.test(args.story)) {
        return '故事目录名只能含字母/数字/下划线/连字符/中文。'
      }
      const wsCreated = ensureWorkspaceSkeleton(workspaceRoot)
      // 航运心法 skills/rules/能力速览 实例化进 .dvd（幂等，不覆盖用户编辑；清理改名遗留旧文件）
      copyTemplates(path.join(templatesRoot(), 'skills'), path.join(workspaceRoot, '.dvd', 'skills'), { 'correction.skill.md': '_correction.skill.md' })
      copyTemplates(path.join(templatesRoot(), 'rules'), path.join(workspaceRoot, '.dvd', 'rules'), { 'correction.rule.md': '_correction.rule.md', 'workspace.rule.md': '_workspace.rule.md' })
      // 官方能力库参考副本（Agent 读卡片/组合包用）
      copyTemplates(path.join(templatesRoot(), 'doctrine'), path.join(workspaceRoot, '.dvd', 'doctrine'))
      seedFileIfAbsent(path.join(workspaceRoot, '.dvd', 'capabilities.md'), readCapabilitiesTemplate())
      const storyRoot = path.join(workspaceRoot, args.story)

      const agentsMd = (() => {
        try {
          const p = path.join(templatesRoot(), 'agents', 'AGENT_TEMPLATE.md')
          return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : ''
        } catch {
          return ''
        }
      })()

      const { created, storyName } = ensureStorySkeleton(storyRoot, args.story, agentsMd)

      initDB(workspaceRoot)
      registerStory(storyRoot, storyName)

      setCurrentContext({ workspaceRoot, storyRoot })

      const parts = [
        `✅ dsh-video ${wsCreated ? '工作区' : '工作区（已存在）'} + ${created ? '新故事' : '故事（已存在）'} 就绪：`,
        `工作区根：${workspaceRoot}`,
        `故事根：${storyRoot}`,
        '',
        '目录契约：',
        '  .dvd/skills,rules,tastes,db,config.json,doctrine ← 机制 + 工作区级审美 + 配置 + 官方能力库副本',
        '  <story>/.story/{wiki,tastes,material,corrections} ← 故事级记忆（decisions 落 .dvd/db）',
        '  <story>/EP001/shots/ ← 创作资产（S001.json 三份记录 + S001.mp4）',
      ]
      const stories = listStories()
      if (stories.length > 1) {
        parts.push('', '工作区现有故事：' + stories.map(s => s.name).join('、'))
      }
      return parts.join('\n')
    },
  }))

  // ---- video_view — 故事全景 ----
  ctx.tools.register(defineTool({
    name: 'video_view',
    description: '查看当前故事全景：故事速览、品味（工作区底色+故事级）、EP 进度、素材档案、纠错清单、最近决策。',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: any) => [{ type: 'text', text: value }],
    },
    async execute(_args: {}, _exec: any) {
      const vctx = effectiveContext()
      if (!vctx.storyRoot) {
        return vctx.workspaceRoot
          ? `当前在工作区 ${vctx.workspaceRoot} 但未处于任何故事目录。工作区故事：${listStories().map(s => s.name).join('、') || '（无）'}。想开新故事告诉我目录名即可（video_init）。`
          : '当前目录不是 dsh-video 故事/工作区。用户确认创作意图后可 video_init 创建。'
      }
      const storyRoot = vctx.storyRoot!
      try {
        const parts: string[] = []
        const overview = path.join(storyRoot, '.story', 'overview.md')
        if (fs.existsSync(overview)) parts.push(fs.readFileSync(overview, 'utf-8'))
        const eps = fs.readdirSync(storyRoot).filter(e => /^EP\d+$/.test(e)).sort()
        if (eps.length > 0) {
          parts.push('## EP 进度')
          for (const ep of eps) {
            const shotsDir = path.join(storyRoot, ep, 'shots')
            const shots = fs.existsSync(shotsDir) ? fs.readdirSync(shotsDir).filter(f => f.endsWith('.json')) : []
            const video = fs.existsSync(path.join(storyRoot, ep, 'video.mp4'))
            parts.push(`- ${ep}：${shots.length} 镜头${video ? '，✅ video.mp4' : ''}`)
          }
          parts.push('')
        }
        const listDir = (sub: string) => {
          try { return fs.readdirSync(path.join(storyRoot, '.story', sub)) } catch { return [] }
        }
        const material = listDir('material')
        if (material.length > 0) {
          parts.push('## 素材档案')
          parts.push(...material.map(m => `- ${m}`))
          parts.push('')
        }
        const corrections = listDir('corrections')
        if (corrections.length > 0) {
          parts.push('## 纠错清单')
          parts.push(...corrections.map(f => `- ${f}`))
          parts.push('')
        }
        const decisions = getRecentDecisions(5)
        if (decisions.length > 0) {
          parts.push('## 最近决策')
          parts.push(...decisions.map(formatSummary))
          parts.push('')
        }
        return parts.join('\n') || '故事记忆还是空的，开拍第一条自然语言吧。'
      } catch (err) {
        return `读取故事全景失败：${err instanceof Error ? err.message : String(err)}（故事目录可能被移动/删除，检查 ${storyRoot}）`
      }
    },
  }))

  // ---- video_remember — 记创作决策 ----
  ctx.tools.register(defineTool({
    name: 'video_remember',
    description: '在你的视频工作区记忆里记录一条创作决策节点（取舍、因果、品味信号），供 video_recall 召回。',
    parameters: {
      decision: { type: 'string', required: true, description: '决策内容' },
      rationale: { type: 'string', required: true, description: '为什么这么定（取舍与因果）' },
      trigger: { type: 'string', description: '触发场景' },
      alternatives: { type: 'string', description: 'JSON 数组 [{option, why_not}]' },
      taste_signals: { type: 'string', description: 'JSON 数组 [{signal, context}]，反映的品味信号' },
      outcome: { type: 'string', description: 'adopted/reverted/refined/pending，默认 adopted' },
      caused_by: { type: 'string', description: '因果链：引发本决策的决策 id' },
      supersedes: { type: 'string', description: '被本决策替代的旧决策 id（存在时自动把旧决策 outcome 更新为 superseded_outcome，默认 refined）' },
      superseded_outcome: { type: 'string', description: '旧决策被取代后的结局：refined（已修正，默认）或 reverted（已推翻）' },
      scopes: { type: 'string', description: 'JSON 数组，分类路径，如 ["tastes/pacing","wiki/prompt"]' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: any) => [{ type: 'text', text: value }],
    },
    async execute(args: Record<string, string | undefined>, _exec: any) {
      if (!currentContext?.workspaceRoot) return '当前上下文没有视频工作区，无法记录决策。'
      const parse = <T,>(v: string | undefined): T => { try { return v ? JSON.parse(v) as T : [] as T } catch { return [] as T } }
      const outcomeNorm = (['adopted', 'reverted', 'refined', 'pending'] as const).includes(args.outcome as any)
        ? (args.outcome as DecisionNode['outcome']) : 'adopted'
      const node: DecisionNode = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        session_id: null,
        decision: args.decision!,
        rationale: args.rationale!,
        trigger: args.trigger ?? null,
        evidence: null,
        outcome: outcomeNorm,
        caused_by: args.caused_by ?? null,
        supersedes: args.supersedes ?? null,
        alternatives: parse(args.alternatives),
        taste_signals: parse(args.taste_signals),
        scopes: parse(args.scopes),
      }
      insertDecision(node)
      // 因果链闭环：被取代的旧决策标记结局（默认 refined；old 不存在则静默跳过）
      let supersededNote = ''
      if (args.supersedes) {
        const prev = getDecisionById(args.supersedes)
        if (prev) {
          const oldOutcome = args.superseded_outcome === 'reverted' ? 'reverted' : 'refined'
          updateDecisionOutcome(args.supersedes, oldOutcome)
          supersededNote = `（已把被取代决策 ${args.supersedes} 的 outcome 更新为 ${oldOutcome}）`
        }
      }
      return `✅ Decision recorded: **${node.decision}** (${node.id})${supersededNote}`
    },
  }))

  // ---- video_recall — 召回决策 ----
  ctx.tools.register(defineTool({
    name: 'video_recall',
    description: '从视频工作区记忆召回决策：不传 id = 摘要列表（query 关键词 / scope 分类 / limit）；传 id = 单条完整详情（rationale/alternatives/taste_signals/因果）。',
    parameters: {
      id: { type: 'string', description: '决策 id，传本参数则返回该条详情' },
      query: { type: 'string', description: '关键词匹配 decision/rationale/trigger' },
      scope: { type: 'string', description: '分类路径过滤（如 tastes/pacing）' },
      limit: { type: 'number', description: '最多返回条数，默认 20' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: any) => [{ type: 'text', text: value }],
    },
    async execute(args: { id?: string; query?: string; scope?: string; limit?: number }, _exec: any) {
      if (!currentContext?.workspaceRoot) return '当前上下文没有视频工作区，无记忆可召回。'
      if (args.id) {
        const d = getDecisionById(args.id)
        if (!d) return `No decision found with id ${args.id}.`
        const parts = [`## ${d.decision} (${d.outcome})`, `id: ${d.id}`, `created_at: ${d.created_at}`]
        if (d.trigger) parts.push(`trigger: ${d.trigger}`)
        parts.push(`rationale: ${d.rationale}`)
        if (d.alternatives.length) parts.push(`alternatives: ${d.alternatives.map(a => `${a.option} (${a.why_not ?? ''})`).join('; ')}`)
        if (d.taste_signals.length) parts.push(`taste_signals: ${d.taste_signals.map(t => `${t.signal}: ${t.context ?? ''}`).join('; ')}`)
        if (d.caused_by) parts.push(`caused_by: ${d.caused_by}`)
        if (d.supersedes) parts.push(`supersedes: ${d.supersedes}`)
        if (d.scopes.length) parts.push(`scopes: ${d.scopes.join(', ')}`)
        return parts.join('\n')
      }
      const limit = Math.min(50, Math.max(1, args.limit ?? 20))
      // scope 下推进 SQL（先过滤后 LIMIT——避免 limit 截断后再过滤把匹配项丢掉）
      const decisions = args.query
        ? searchDecisions(args.query, limit, args.scope)
        : args.scope
          ? searchDecisions('', limit, args.scope)
          : getRecentDecisions(limit)
      if (decisions.length === 0) return 'No related decisions found.'
      return '## Decision Summaries\n' + decisions.map(formatSummary).join('\n') + '\n\n传 id 可看单条完整详情。'
    },
  }))

  // ---- generate_shot — 校验/转译/计价/出片 ----
  ctx.tools.register(defineTool({
    name: 'generate_shot',
    description: '标准镜头语言 JSON → seeddance 出片（v1 单镜头）。' +
      '先校验 11 域轴值合法性，再转译两层提示词（标准句法/厂商叙述流）并计价。' +
      'dry_run=true 或无 API key 时只返回转译+计价预览（不花钱、不落盘）；' +
      '否则提交生成（幂等：同 shot 有未完成任务时拒绝重复提交）并把三份记录落盘。',
    parameters: {
      shot_json: { type: 'string', required: true, description: '标准镜头语言 JSON 原文。必填：shot.subject（主体与动作）、shot.index（如 S001）、shot.axes（11 域轴值 map：size/angle/movement/composition/lighting/color/pacing/sound/format/vfx/performance）。可选：shot.shot.duration（秒，2–30，缺失用工作区/插件默认）、shot.windows（[{from,to,movement}] 时间窗）、shot.cards（手法卡片 id 数组）、constraints、materials、meta。' },
      dry_run: { type: 'boolean', description: 'true 只校验+转译+计价不提交（默认：无 key 时强制 true）' },
      adapter: { type: 'string', description: `adapter 名（对应工作区 .dvd.config.json 里 adapters[].name）；默认 ${DEFAULT_ADAPTER}（v1 仅 seedance）` },
      reference_urls: { type: 'string', description: 'JSON 数组：可公开访问的 HTTPS 图片 URL（PNG/JPEG/WebP）。无 reference_mode 时：1 张=图生视频、2 张=首尾帧、3+ 张=参考生视频；reference_mode=true 时 1–2 张当参考素材（仅 seedance-2.0/2.5）。2.5 上限 30 张，其余模型 4 张。' },
      content_filter: { type: 'boolean', description: '默认 true；false 按官方 1.1 倍费率计费' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: any) => [{ type: 'text', text: value }],
    },
    async execute(args: { shot_json: string; dry_run?: boolean; adapter?: string; reference_urls?: string; content_filter?: boolean }, _exec: any) {
      const vctx = effectiveContext()
      if (!vctx.storyRoot) return '当前不在任何故事目录。先在故事目录内工作（或 video_init 创建）。'

      let shot: ShotJSON
      try {
        shot = JSON.parse(args.shot_json) as ShotJSON
      } catch {
        return 'shot_json 不是合法 JSON。先用校验目的重贴。'
      }
      if (!shot.shot?.subject || !shot.shot?.index) return 'shot_json 缺 shot.subject / shot.index。'
      if (!shot.shot.axes || typeof shot.shot.axes !== 'object') return 'shot_json 缺 shot.axes（11 域轴值）。'
      // 路径穿越防护：index/episode 参与 path.join 落盘，必须是白名单名（模型输入不可信）
      if (!SAFE_INDEX.test(shot.shot.index)) return `shot.index 只允许字母/数字/下划线/连字符（如 S001），当前值「${shot.shot.index}」不合法，已拒绝。`
      const episode = safeEpisode(shot.shot.episode)

      const axes = loadAxes()
      const errors = validateAxes(shot.shot.axes, axes)
      if (errors.length > 0) return '轴值校验失败：\n' + errors.map(e => `- ${e}`).join('\n')

      const contentFilter = args.content_filter ?? true

      // ---- 适配器解析（.dvd.config.json 按 name 对应；文件 apiKey 优先，环境变量兜底） ----
      const wsCfg = vctx.workspaceRoot ? loadWorkspaceConfig(vctx.workspaceRoot) : {}
      const adapterName = args.adapter ?? shot.meta?.adapter ?? wsCfg.adapter ?? DEFAULT_ADAPTER
      const configRoot = vctx.workspaceRoot ?? process.cwd()
      const resolved = resolveAdapter(configRoot, adapterName)
      const supported = (SUPPORTED_ADAPTERS as readonly string[]).includes(adapterName)
      if (!supported) {
        return resolved.configured
          ? `已配置 adapter「${adapterName}」，但 v1 客户端未实现（当前支持：${SUPPORTED_ADAPTERS.join('、')}）。其余 adapter 在路线图上，未静默忽略。`
          : `未知 adapter「${adapterName}」（当前支持：${SUPPORTED_ADAPTERS.join('、')}）。工作区已配置：\n${describeAdapters(configRoot)}`
      }

      const apiKey = resolved.apiKey
      const model = resolved.model ?? config.seedanceModel
      const apiBase = resolved.baseUrl
      const isDry = args.dry_run === true || !apiKey

      // ---- reference_urls 校验：数组 + 公网 HTTPS + 张数上限（模型相关） ----
      let referenceUrls: string[] = []
      try {
        const parsed = args.reference_urls ? JSON.parse(args.reference_urls) : []
        if (!Array.isArray(parsed)) return 'reference_urls 必须是 JSON 数组。'
        const bad = parsed.find(u => typeof u !== 'string' || !/^https:\/\//.test(u))
        if (bad !== undefined) return `reference_urls 含非法项（须公网 HTTPS URL）：${JSON.stringify(bad)}`
        const cap = model.includes('2.5') ? 30 : 4
        if (parsed.length > cap) return `reference_urls 超过 ${cap} 张上限（${model}）。`
        referenceUrls = parsed
      } catch {
        return 'reference_urls 不是合法 JSON 数组。'
      }

      // ---- 运行参数合并：shot 内嵌 > 工作区 .dvd/config.json > 插件配置 ----
      const duration = clampDuration(shot.shot.duration, Number(wsCfg.defaultDuration), config.defaultDuration)
      const quality: '480p' | '720p' | '1080p' = (wsCfg.defaultQuality === '480p' || wsCfg.defaultQuality === '720p' || wsCfg.defaultQuality === '1080p')
        ? wsCfg.defaultQuality : config.defaultQuality
      const axisFormat = typeof shot.shot.axes?.format === 'string' ? shot.shot.axes.format.trim() : ''
      const aspectRatio = axisFormat || wsCfg.defaultAspectRatio || config.defaultAspectRatio
      // 费率系数：reference_mode 带参考图 ×1.1（保守占位估算，官方无此费率条款）；content_filter=false 官方 ×1.1（可叠加）
      let hasRefFactor = false
      let modeFactor = 1
      if (referenceUrls.length > 0 && config.referenceMode) { modeFactor *= 1.1; hasRefFactor = true }
      if (contentFilter === false) modeFactor *= 1.1
      const cost = estimate(model, duration, quality, modeFactor)

      const request = toRequest(shot, {
        model,
        duration,
        quality,
        aspectRatio,
        referenceMode: config.referenceMode,
        contentFilter,
        referenceUrls,
      })

      const recordFile = path.join(vctx.storyRoot!, episode, 'shots', `${shot.shot.index}.json`)

      const preview = [
        '## 🎬 镜头编译预览',
        `**标准层（可倒解析回 11 域）**：${buildStandardSentence(shot)}`,
        `**厂商层（${adapterName} prompt 全文）**：${request.prompt}`,
        `**参数**：adapter=${adapterName}｜model=${request.model}｜duration=${request.duration}s｜quality=${request.quality}｜aspect=${request.aspect_ratio}`,
        referenceUrls.length ? `**参考图**：${referenceUrls.length} 张，reference_mode=${request.reference_mode}` : '**参考图**：无（纯文生视频）',
        `**成本预估**：≈ ${cost.estimatedCredits} 积分（费率系数 ×${cost.modeFactor}${hasRefFactor ? '，reference 系数为保守占位估算（官方无此费率条款）' : ''}${cost.matchedModel ? '' : '；⚠️ 计价表无该型号，按 seedance-2.0-fast 档估算'}；${cost.pricingNote}）`,
      ]
      if (resolved.corrupt) preview.push('⚠️ `.dvd.config.json` 存在但 JSON 损坏——凭证/模型配置未被读取（环境变量通道仍在）。修复该文件后重试。')
      if (vctx.workspaceRoot && workspaceConfigCorrupt(vctx.workspaceRoot)) preview.push('⚠️ `.dvd/config.json` 存在但 JSON 损坏——预算/默认参数已回退插件默认值，请修复以避免预算失守。')

      if (isDry) {
        preview.push(`**dry_run 模式**（${args.dry_run ? '显式指定' : '未检测到 API key（.dvd.config.json 与 SEEDANCE_API_KEY 环境变量均未配置）'}）：未提交生成、未花钱、未落盘。`)
        return preview.join('\n')
      }

      // ---- 记录损坏 = 硬失败（绝不当作不存在——那会让幂等失效导致重复 POST 双倍扣费） ----
      const recordExists = fs.existsSync(recordFile)
      const existing = recordExists ? readShotRecord(recordFile) : null
      if (recordExists && !existing) {
        return `shot 记录 ${recordFile} 已存在但 JSON 损坏。为避免重复提交扣费已中止。请人工核对/修复该文件（或确认无未完成任务后删除再重提）。`
      }

      // ---- 幂等快路径：同 shot 有 pending 任务则拒绝重复提交 ----
      if (existing?.meta.task_id && existing.meta.status === 'pending') {
        const taskCheck = await getTask(existing.meta.task_id, apiKey, apiBase).catch(() => null)
        if (!taskCheck || taskCheck.status === 'pending' || taskCheck.status === 'processing') {
          return `该 shot 已有未完成任务 ${existing.meta.task_id}，拒绝重复提交（官方明示重复 POST 会创建第二个任务）。用 video_task 查进度；确认失败后 video_task 会把记录标记 failed，再重提。`
        }
      }

      // ---- 预算硬闸 ----
      const budget = wsCfg.budgetCredits ?? config.budgetCredits
      if (budget > 0 && cost.estimatedCredits > budget) {
        return `预算硬闸拦截：预估 ${cost.estimatedCredits} 积分 > 预算上限 ${budget}。调低时长/画质或修改 .dvd/config.json。`
      }

      // 同 shot 进程内互斥：并行 generate_shot 的 check-then-act 竞态防护（锁内重查 + POST + 落盘）
      return await withLock(recordFile, async () => {
        const current = fs.existsSync(recordFile) ? readShotRecord(recordFile) : null
        if (current?.meta.task_id && current.meta.status === 'pending') {
          try {
            const taskCheck = await getTask(current.meta.task_id, apiKey, apiBase)
            if (taskCheck.status === 'pending' || taskCheck.status === 'processing') {
              return `该 shot 已有未完成任务 ${current.meta.task_id}，拒绝重复提交。`
            }
          } catch {
            return `该 shot 已有未完成任务 ${current.meta.task_id}，但远程查询失败（网络/权限），保守拒绝重提。用 video_task 确认状态后再试。`
          }
        }
        let balanceInfo = ''
        try {
          const credits = await getCredits(apiKey, apiBase)
          balanceInfo = `（当前余额：${JSON.stringify(credits)}）`
        } catch { /* 查余额失败不阻塞 */ }

        const task = await createGeneration(request, apiKey, apiBase)

        const record: ShotRecord = {
          shot,
          vendor_prompt: request.prompt,
          meta: {
            adapter: adapterName,
            schema_ver: shot.meta?.schema_ver ?? current?.meta.schema_ver ?? '1.0',
            model: request.model,
            duration: request.duration,
            quality: request.quality,
            task_id: task.task_id,
            status: 'pending',
            reference_urls: referenceUrls,
            attempts: [...(current?.meta.attempts ?? []), { at: new Date().toISOString(), task_id: task.task_id, vendor_prompt: request.prompt }].slice(-5),
          },
        }
        writeShotRecord(recordFile, record)

        return [
          ...preview,
          '',
          `✅ 已提交生成：task_id=${task.task_id}，状态 ${task.status} ${balanceInfo}`,
          `三份记录已落盘：${recordFile}（shot / vendor_prompt / meta）`,
          '出片后调用 video_task 查询并取回 mp4。',
        ].join('\n')
      })
    },
  }))

  // ---- video_task — 任务进度/取片 ----
  ctx.tools.register(defineTool({
    name: 'video_task',
    description: '查询 seeddance 任务进度；完成时可选把 mp4 下载到故事 EP 的 shots 目录并更新 shot 记录状态。',
    parameters: {
      task_id: { type: 'string', required: true, description: 'generate_shot 返回的 task_id' },
      episode: { type: 'string', description: '下载到的 EP 目录（默认 EP001）' },
      index: { type: 'string', description: 'shot 序号（如 S001），用于命名 mp4 + 更新对应记录；缺省用 task_id 命名' },
      adapter: { type: 'string', description: `adapter 名；默认取 shot 记录的 meta.adapter，再兜底 ${DEFAULT_ADAPTER}` },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: any) => [{ type: 'text', text: value }],
    },
    async execute(args: { task_id: string; episode?: string; index?: string; adapter?: string }, _exec: any) {
      const vctx = effectiveContext()
      // 路径穿越防护：index/episode 参与 path.join
      if (args.index && !SAFE_INDEX.test(args.index)) return `index 只允许字母/数字/下划线/连字符（如 S001），当前值「${args.index}」已拒绝。`
      const episode = safeEpisode(args.episode)
      // adapter：参数优先 → shot 记录 meta.adapter → 工作区 config.adapter → 默认
      const configRoot = vctx.workspaceRoot ?? process.cwd()
      const wsCfg = vctx.workspaceRoot ? loadWorkspaceConfig(vctx.workspaceRoot) : {}
      const shotsDir = vctx.storyRoot ? path.join(vctx.storyRoot, episode, 'shots') : null
      let record: ShotRecord | null = null
      if (shotsDir && args.index) record = readShotRecord(path.join(shotsDir, `${args.index}.json`))
      const adapterName = args.adapter ?? record?.meta.adapter ?? wsCfg.adapter ?? DEFAULT_ADAPTER
      const resolved = resolveAdapter(configRoot, adapterName)
      const apiKey = resolved.apiKey
      if (!apiKey) return `未检测到 API key（.dvd.config.json 的 ${adapterName}.apiKey 或 SEEDANCE_API_KEY 环境变量），无法查询任务。`
      const task = await getTask(args.task_id, apiKey, resolved.baseUrl)
      const errText = (task.error && (task.error.message || task.error.code)) ? `${task.error.message ?? task.error.code}` : task.status
      // 失败终态：记录标记 failed + 失败归因（解除 pending 死锁，幂等重提的前置条件）
      if (['failed', 'error', 'cancelled', 'canceled'].includes(task.status)) {
        if (shotsDir && args.index && record) {
          record.meta.status = 'failed'
          record.meta.error = typeof task.error === 'object' && task.error ? (task.error.message ?? task.error.code ?? task.status) : task.status
          writeShotRecord(path.join(shotsDir, `${args.index}.json`), record)
          return `task ${args.task_id} 已失败（${errText}），记录已标记 failed 并写入失败归因；整改后重新 generate_shot 即可。`
        }
        return `task ${args.task_id} 已失败（${errText}）。归因整改后重新 generate_shot 即可。`
      }
      if (!['done', 'succeeded', 'completed', 'success'].includes(task.status)) {
        return `task ${args.task_id} 状态：${task.status}。稍后再查。`
      }
      // 官方响应层级：成片 URL 在 output.video_url（处理中为 null；顶层字段仅作兼容兜底）
      const videoUrl = extractVideoUrl(task)
      if (!videoUrl) return `task ${args.task_id} 已完成但响应里没有视频 URL（output.video_url 为空）。稍后重查或服务端回查。`
      if (!vctx.storyRoot || !shotsDir) return `task 完成，video_url=${videoUrl}（当前不在故事目录，未下载）`

      const base = args.index ?? args.task_id
      const mp4 = path.join(shotsDir, `${base}.mp4`)
      let res: Response
      try {
        res = await fetch(videoUrl, { signal: AbortSignal.timeout(300_000) })
      } catch {
        return `下载失败：请求超时（>5 分钟）。成片 url=${videoUrl}`
      }
      if (!res.ok) return `下载失败：HTTP ${res.status}。成片 url=${videoUrl}`
      const clen = Number(res.headers.get('content-length') ?? 0)
      if (clen > MAX_MP4_BYTES) return `下载失败：成片大小 ${(clen / 1048576).toFixed(0)}MB 超过上限 500MB。成片 url=${videoUrl}`
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > MAX_MP4_BYTES) return `下载失败：成片大小 ${(buf.length / 1048576).toFixed(0)}MB 超过上限 500MB。成片 url=${videoUrl}`
      fs.mkdirSync(path.dirname(mp4), { recursive: true })
      fs.writeFileSync(mp4, buf)

      if (args.index && record) {
        record.meta.status = 'done'
        record.meta.video_file = mp4
        record.meta.done_at = new Date().toISOString()
        record.meta.error = undefined
        writeShotRecord(path.join(shotsDir, `${args.index}.json`), record)
      }
      return `✅ ${args.task_id} 出片完成：${mp4}（${Math.round(buf.length / 1024)} KB）`
    },
  }))

  // ---- svg_render — SVG → PNG ----
  ctx.tools.register(defineTool({
    name: 'svg_render',
    description: '把 SVG 文本栅格化为 PNG（服务端 sharp；失败给安装提示）。用途：确认卡构图预览、material 设定卡配图。' +
      '注意：本地 PNG 不能直接喂 seeddance（官方只收公网 HTTPS URL）；本地图仅供人确认，或日后上传获得 URL 后再走 reference_urls。',
    parameters: {
      svg: { type: 'string', required: true, description: 'SVG 文本（Agent 生成的构图示意/设定卡）' },
      name: { type: 'string', description: '输出文件名（无扩展名，默认 preview）' },
      dir: { type: 'string', description: '输出目录（默认当前故事的 .preview/）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: any) => [{ type: 'text', text: value }],
    },
    async execute(args: { svg: string; name?: string; dir?: string }, _exec: any) {
      const vctx = effectiveContext()
      const outDir = path.resolve(args.dir ?? (vctx.storyRoot ? path.join(vctx.storyRoot, '.preview') : path.join(process.cwd(), '.preview')))
      fs.mkdirSync(outDir, { recursive: true })
      const base = (args.name ?? 'preview').replace(/[/\\]/g, '_')
      const svgFile = path.join(outDir, `${base}.svg`)
      const pngFile = path.join(outDir, `${base}.png`)
      fs.writeFileSync(svgFile, args.svg)
      try {
        const sharp = (await import('sharp')).default
        const info = await sharp(Buffer.from(args.svg)).png().toFile(pngFile)
        return `✅ 已栅格化：${pngFile}（${info.width}x${info.height}）\nSVG 源：${svgFile}`
      } catch (err) {
        return `SVG 渲染失败：${err instanceof Error ? err.message : String(err)}\n若为 sharp 缺失，请在插件包目录执行 npm i sharp。SVG 文本已存 ${svgFile}。`
      }
    },
  }))
}