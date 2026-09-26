// agent/events — session 事件监听
// session-start：解析视频上下文（向上找 .dvd/.story）→ 能力速览常驻注入（文件驱动）→
//               工作区/故事在场：确保骨架 + 注入心法总纲 + Story Context 投影。
// 激活三态（在速览表内）：态①无 .story → 引导 video_init；态②有 .story → 直接激活；未表意永不打扰。

import type { Context } from '@deepseek-ai/cordis'
import { resolveContext, ensureStorySkeleton, ensureWorkspaceSkeleton, copyTemplates, seedFileIfAbsent } from '../workspace/index.js'
import { initDB, closeDB } from '../db/index.js'
import { buildDoctrineGuide, buildStoryContext, buildCapabilities } from './context.js'
import { setCurrentContext, peekVideoContext } from './tools.js'
import type { Config } from '../config/index.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))

/** 航运模板根（lib/templates） */
function templatesRoot(): string {
  return path.join(MODULE_DIR, '..', 'templates')
}

/** 从 agent.session.header.cwd 解析 cwd */
function resolveCwd(agent: any): string | null {
  try {
    const cwd = agent?.session?.header?.cwd
    if (typeof cwd === 'string' && cwd.length > 0) return cwd
    return null
  } catch {
    return null
  }
}

/** 读航运 AGENTS 总纲模板（改名 AGENT_TEMPLATE.md：避免本仓库被 dsh 自动加载为指令污染，见 .mesync/corrections/） */
function loadAgentsTemplate(): string {
  try {
    const p = path.join(templatesRoot(), 'agents', 'AGENT_TEMPLATE.md')
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8')
  } catch { /* ignore */ }
  return ''
}

/** 读航运能力速览母版（播种到 .dvd/capabilities.md + 兜底注入） */
function loadCapabilitiesTemplate(): string {
  try {
    const p = path.join(templatesRoot(), 'agents', 'CAPABILITIES.md')
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8')
  } catch { /* ignore */ }
  return ''
}

/**
 * 三段注入只注册一次（宿主契约：同一 ctx 层重名注册 systemPrompt.section 会抛异常——
 * session-start 每个会话/子代理都会再次触发，重复注册 = 第二次会话必然崩溃）。
 * text() 在每次 prompt 组装时动态解析「当前会话」的上下文（模块态），不捕获首会话闭包。
 */
let sectionsRegistered = false

export function registerEvents(ctx: Context, config: Config): void {
  if (!sectionsRegistered) {
    sectionsRegistered = true
    ctx.systemPrompt.section({
      name: 'video-capabilities',
      order: 125,
      text: () => buildCapabilities(peekVideoContext()?.workspaceRoot ?? null, loadCapabilitiesTemplate()),
    })
    ctx.systemPrompt.section({
      name: 'video-doctrine-guide',
      order: 135,
      text: () => {
        const vctx = peekVideoContext()
        return vctx?.storyRoot ? buildDoctrineGuide(vctx.storyRoot, loadAgentsTemplate()) : ''
      },
    })
    ctx.systemPrompt.section({
      name: 'video-story-context',
      order: 145,
      text: () => {
        const vctx = peekVideoContext()
        return vctx?.storyRoot
          ? buildStoryContext(vctx.storyRoot, vctx.workspaceRoot, { maxDecisions: config.maxRecallDecisions })
          : ''
      },
    })
  }

  ctx.on('agent/session-start', async (payload: { agent: any; source: unknown }) => {
    const cwd = resolveCwd(payload.agent)
    if (!cwd) {
      console.warn('[dsh-video] session has no cwd, skip')
      return
    }

    const vctx = resolveContext(cwd)
    setCurrentContext(vctx)

    const capabilitiesTemplate = loadCapabilitiesTemplate()
    const agentsTemplate = loadAgentsTemplate()

    // ---- 工作区在场：确保骨架 + 播种可编辑副本 + 初始化库（幂等） ----
    if (vctx.workspaceRoot) {
      ensureWorkspaceSkeleton(vctx.workspaceRoot)
      // 心法 skills 航运资产实例化进 .dvd（幂等，不覆盖用户编辑；清理改名遗留旧文件）
      copyTemplates(path.join(templatesRoot(), 'skills'), path.join(vctx.workspaceRoot, '.dvd', 'skills'), { 'correction.skill.md': '_correction.skill.md' })
      copyTemplates(path.join(templatesRoot(), 'rules'), path.join(vctx.workspaceRoot, '.dvd', 'rules'), { 'correction.rule.md': '_correction.rule.md', 'workspace.rule.md': '_workspace.rule.md' })
      // 官方能力库参考副本（Agent 读卡片/组合包用；封闭轴硬校验以插件航运为准）
      copyTemplates(path.join(templatesRoot(), 'doctrine'), path.join(vctx.workspaceRoot, '.dvd', 'doctrine'))
      // 能力速览表（用户可编辑，缺失时兜底航运母版）
      seedFileIfAbsent(path.join(vctx.workspaceRoot, '.dvd', 'capabilities.md'), capabilitiesTemplate)
      initDB(vctx.workspaceRoot)
    }

    // ---- 故事在场：态②直接激活（幂等补全骨架；AGENTS.md 缺失时用航运模板补） ----
    if (vctx.storyRoot) {
      ensureStorySkeleton(vctx.storyRoot, undefined, agentsTemplate)
    }
  })

  // 清理
  ctx.effect(() => {
    return () => {
      setCurrentContext(null)
      closeDB()
    }
  })
}