// workspace/config.ts —— 用户配置装载（工作区标记发现 + .dvd.config.json + 环境变量，100% 用户提供）
//
// 发现机制【照搬 master 已验证实现，v1 src/workspace/index.ts + src/adapters/registry.ts】：
//   从当前目录向上找 `.dvd` 目录标记 → 命中目录即「视频工作区根」→
//   读工作区根下的 `.dvd.config.json`（v2 扁平四字段：apiKey/model/createUrl/queryUrl）。
//   不在工作区（找不到 .dvd 标记）就如实报缺——插件不猜、不造备选锚点。
// 插件零内置模型/URL 事实：这里只有「按标记找根、读配置、补环境变量、缺什么列什么」的机械逻辑。

import * as fs from 'node:fs'
import * as path from 'node:path'

/** 工作区根标记目录名（master 契约：.dvd = 机制目录，其所在目录即工作区根） */
export const WORKSPACE_MARKER = '.dvd'
/** 工作区根下的适配器配置文件名 */
export const CONFIG_FILE = '.dvd.config.json'

export const ENV_API_KEY = 'SEEDANCE_API_KEY'
export const ENV_MODEL = 'SEEDANCE_MODEL'
export const ENV_CREATE_URL = 'SEEDANCE_CREATE_URL'
export const ENV_QUERY_URL = 'SEEDANCE_QUERY_URL'

/**
 * 向上找视频工作区根（含 `.dvd` 目录标记的目录）。找不到返回 null。
 * 与 master `resolveContext(cwd)` 同语义：只认标记，不做任何路径猜测。
 */
export function resolveWorkspaceRoot(fromDir: string): string | null {
  let dir = path.resolve(fromDir)
  for (;;) {
    const marker = path.join(dir, WORKSPACE_MARKER)
    if (fs.existsSync(marker) && fs.statSync(marker).isDirectory()) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export interface VideoUserConfig {
  apiKey?: string
  model?: string
  createUrl?: string
  queryUrl?: string
}

/** 读取配置文件（损坏显式报错，不静默忽略） */
export function readConfigFile(file: string): { data: VideoUserConfig; corrupt: Error | null } {
  try {
    const raw = fs.readFileSync(file, 'utf-8')
    const data = JSON.parse(raw) as Record<string, unknown>
    return {
      data: {
        apiKey: typeof data.apiKey === 'string' && data.apiKey.trim() !== '' ? data.apiKey.trim() : undefined,
        model: typeof data.model === 'string' && data.model.trim() !== '' ? data.model.trim() : undefined,
        createUrl: typeof data.createUrl === 'string' && data.createUrl.trim() !== '' ? data.createUrl.trim() : undefined,
        queryUrl: typeof data.queryUrl === 'string' && data.queryUrl.trim() !== '' ? data.queryUrl.trim() : undefined,
      },
      corrupt: null,
    }
  } catch (err) {
    return { data: {}, corrupt: err instanceof Error ? err : new Error(String(err)) }
  }
}

/** 环境变量通道（密钥优先走环境变量，避免密钥进文件/进远端） */
function envConfig(): VideoUserConfig {
  const pick = (name: string) => {
    const v = process.env[name]
    return v && v.trim() !== '' ? v.trim() : undefined
  }
  return {
    apiKey: pick(ENV_API_KEY),
    model: pick(ENV_MODEL),
    createUrl: pick(ENV_CREATE_URL),
    queryUrl: pick(ENV_QUERY_URL),
  }
}

/** 解析结果：每缺失一项列出，供工具层出可操作的中文报错 */
export interface ResolvedConfig {
  /** 工作区根（含 .dvd 标记的目录）；null = 未在视频工作区内（向上找不到标记） */
  workspaceRoot: string | null
  /** 配置文件路径（null = 工作区根下没有该文件，仅环境变量通道） */
  file: string | null
  corrupt: Error | null
  apiKey?: string
  model?: string
  createUrl?: string
  queryUrl?: string
  missing: string[]
}

/**
 * 配置装载：找 .dvd 标记 → 读工作区根 .dvd.config.json → 环境变量补齐 →
 * `missing` 列出仍缺的项（apiKey/model/createUrl/queryUrl）。
 */
export function resolveConfig(fromDir: string): ResolvedConfig {
  const workspaceRoot = resolveWorkspaceRoot(fromDir)
  const candidate = workspaceRoot ? path.join(workspaceRoot, CONFIG_FILE) : null
  const file = candidate && fs.existsSync(candidate) ? candidate : null
  const fileData: VideoUserConfig = {}
  let corrupt: Error | null = null
  if (file) {
    const r = readConfigFile(file)
    if (r.corrupt) {
      corrupt = r.corrupt
    } else {
      Object.assign(fileData, r.data)
    }
  }
  const env = envConfig()
  const merged: VideoUserConfig = {
    apiKey: fileData.apiKey ?? env.apiKey,
    model: fileData.model ?? env.model,
    createUrl: fileData.createUrl ?? env.createUrl,
    queryUrl: fileData.queryUrl ?? env.queryUrl,
  }
  const missing: string[] = []
  for (const key of ['apiKey', 'model', 'createUrl', 'queryUrl'] as const) {
    if (!merged[key]) missing.push(key)
  }
  return { workspaceRoot, file, corrupt, ...merged, missing }
}

/** queryUrl 模板校验：必须含 {task_id} 占位符，否则轮询走投无路 */
export function queryUrlError(queryUrl: string): string | null {
  return queryUrl.includes('{task_id}') ? null : 'queryUrl 必须含占位符 {task_id}（查询任务地址模板，轮询时把真实任务 ID 替换进去）。'
}