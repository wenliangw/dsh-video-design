// workspace/config.ts —— 用户配置装载（.dvd.config.json 或环境变量，100% 用户提供）
//
// 插件零内置模型/URL 事实：这里只有「读配置、补环境变量、缺什么列什么」的机械逻辑。
// 配置示例（README.md 有完整说明）：
// {
//   "apiKey": "…",                // 或环境变量 SEEDANCE_API_KEY（推荐：密钥不进文件）
//   "model": "…",                 // 或环境变量 SEEDANCE_MODEL（模型版本 ID，用户填）
//   "createUrl": "创建任务的完整 API 地址（用户填，插件不知任何路径）",
//   "queryUrl": "查询任务的完整 API 地址模板（用户填，须含 {task_id} 占位符）"
// }

import * as fs from 'node:fs'
import * as path from 'node:path'

export const CONFIG_FILE = '.dvd.config.json'
export const ENV_API_KEY = 'SEEDANCE_API_KEY'
export const ENV_MODEL = 'SEEDANCE_MODEL'
export const ENV_CREATE_URL = 'SEEDANCE_CREATE_URL'
export const ENV_QUERY_URL = 'SEEDANCE_QUERY_URL'

export interface VideoUserConfig {
  apiKey?: string
  model?: string
  createUrl?: string
  queryUrl?: string
}

/** 向上找 .dvd.config.json 的路径（找不到返回 null） */
export function findConfigFile(fromDir: string): string | null {
  let dir = path.resolve(fromDir)
  for (;;) {
    const candidate = path.join(dir, CONFIG_FILE)
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
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
  /** 配置文件路径（null = 没找到，仅环境变量通道） */
  file: string | null
  corrupt: Error | null
  apiKey?: string
  model?: string
  createUrl?: string
  queryUrl?: string
  missing: string[]
}

/** 配置装载：配置文件 > 环境变量；`missing` 列出仍缺的项（apiKey/model/createUrl/queryUrl） */
export function resolveConfig(fromDir: string): ResolvedConfig {
  const file = findConfigFile(fromDir)
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
  return { file, corrupt, ...merged, missing }
}

/** queryUrl 模板校验：必须含 {task_id} 占位符，否则轮询走投无路 */
export function queryUrlError(queryUrl: string): string | null {
  return queryUrl.includes('{task_id}') ? null : 'queryUrl 必须含占位符 {task_id}（查询任务地址模板，轮询时把真实任务 ID 替换进去）。'
}