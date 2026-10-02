// test/config.test.ts —— 用户配置装载（照搬 master 发现机制）：
// 从当前目录向上找 `.dvd` 目录标记 → 工作区根 → 读根下 .dvd.config.json → 环境变量补齐；
// 缺什么只列什么；损坏显式报错；无标记 = 不在视频工作区。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  resolveConfig, resolveWorkspaceRoot, readConfigFile, queryUrlError, WORKSPACE_MARKER,
} from '../src/workspace/config.js'

const FULL = {
  apiKey: 'key-abc',
  model: 'user-model-id',
  createUrl: 'https://apihost.example/tasks',
  queryUrl: 'https://apihost.example/tasks/{task_id}',
}
// 注意：测试里的 https 只出现在「用户配置模拟数据」，不在 src/ 源码（红线测试只扫 src/）。

let tmp: string
/** 建一个带 .dvd 标记的模拟视频工作区，返回其根 */
function makeWorkspace(): string {
  fs.mkdirSync(path.join(tmp, WORKSPACE_MARKER), { recursive: true })
  return tmp
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2cfg-'))
  vi.stubEnv('SEEDANCE_API_KEY', '')
  vi.stubEnv('SEEDANCE_MODEL', '')
  vi.stubEnv('SEEDANCE_CREATE_URL', '')
  vi.stubEnv('SEEDANCE_QUERY_URL', '')
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe('resolveWorkspaceRoot 工作区根（.dvd 标记，master 契约）', () => {
  it('从工作区子目录向上命中 .dvd 标记 → 返回工作区根', () => {
    makeWorkspace()
    const sub = path.join(tmp, 'story', 'EP001', 'shots')
    fs.mkdirSync(sub, { recursive: true })
    expect(resolveWorkspaceRoot(sub)).toBe(tmp)
  })

  it('无标记 → null（不在视频工作区内，如实报告）', () => {
    expect(resolveWorkspaceRoot(tmp)).toBeNull()
  })

  it('只认目录标记：同名普通「文件」不算数', () => {
    fs.writeFileSync(path.join(tmp, WORKSPACE_MARKER), 'not a dir')
    expect(resolveWorkspaceRoot(tmp)).toBeNull()
  })
})

describe('resolveConfig 用户配置装载', () => {
  it('不在工作区（无 .dvd 标记）且无环境变量 → workspaceRoot null，四字段全部 missing', () => {
    const r = resolveConfig(tmp)
    expect(r.workspaceRoot).toBeNull()
    expect(r.file).toBeNull()
    expect(r.corrupt).toBeNull()
    expect([...r.missing].sort()).toEqual(['apiKey', 'createUrl', 'model', 'queryUrl'])
  })

  it('工作区根 .dvd.config.json 四字段齐 → 全解析、missing 空（master 已验证路径）', () => {
    makeWorkspace()
    fs.writeFileSync(path.join(tmp, '.dvd.config.json'), JSON.stringify(FULL))
    const r = resolveConfig(tmp)
    expect(r.workspaceRoot).toBe(tmp)
    expect(r.file).toBe(path.join(tmp, '.dvd.config.json'))
    expect(r.missing).toEqual([])
    expect(r.apiKey).toBe('key-abc')
    expect(r.model).toBe('user-model-id')
    expect(r.createUrl).toBe('https://apihost.example/tasks')
    expect(r.queryUrl).toBe('https://apihost.example/tasks/{task_id}')
  })

  it('从子目录调用同样命中工作区配置（在故事子目录里开工具也找得到）', () => {
    makeWorkspace()
    fs.writeFileSync(path.join(tmp, '.dvd.config.json'), JSON.stringify(FULL))
    const sub = path.join(tmp, 'a', 'b')
    fs.mkdirSync(sub, { recursive: true })
    const r = resolveConfig(sub)
    expect(r.workspaceRoot).toBe(tmp)
    expect(r.missing).toEqual([])
  })

  it('文件缺 model，环境变量补上 → 合并成功；文件优先于环境变量', () => {
    makeWorkspace()
    fs.writeFileSync(path.join(tmp, '.dvd.config.json'), JSON.stringify({
      apiKey: 'file-key',
      model: 'file-model',
      createUrl: 'https://apihost.example/tasks',
      queryUrl: 'https://apihost.example/tasks/{task_id}',
    }))
    vi.stubEnv('SEEDANCE_MODEL', 'env-model')
    vi.stubEnv('SEEDANCE_API_KEY', 'env-key')
    const r = resolveConfig(tmp)
    expect(r.model).toBe('file-model') // 文件优先
    expect(r.apiKey).toBe('file-key')
    expect(r.missing).toEqual([])
  })

  it('只有环境变量 → 全走 env 通道，missing 空（master 语义：不在工作区也能靠 env 生成）', () => {
    vi.stubEnv('SEEDANCE_API_KEY', 'env-key')
    vi.stubEnv('SEEDANCE_MODEL', 'env-model')
    vi.stubEnv('SEEDANCE_CREATE_URL', 'https://apihost.example/tasks')
    vi.stubEnv('SEEDANCE_QUERY_URL', 'https://apihost.example/tasks/{task_id}')
    const r = resolveConfig(tmp)
    expect(r.workspaceRoot).toBeNull()
    expect(r.file).toBeNull()
    expect(r.apiKey).toBe('env-key')
    expect(r.missing).toEqual([])
  })

  it('配置文件 JSON 损坏 → corrupt 显式报错，不静默当没配置', () => {
    makeWorkspace()
    const f = path.join(tmp, '.dvd.config.json')
    fs.writeFileSync(f, '{ 这不是 JSON')
    const r = resolveConfig(tmp)
    expect(r.corrupt).not.toBeNull()
    expect(r.missing.length).toBeGreaterThan(0)
  })

  it('有工作区标记但根下没有配置文件 → file null、缺失列全（要的是工作区根文件，不是别的目录里的）', () => {
    makeWorkspace()
    // 把配置文件错放在 .dvd/ 里（v1 里 .dvd/config.json 是行为配置，凭证文件必须在工作区根）
    fs.writeFileSync(path.join(tmp, WORKSPACE_MARKER, 'config.json'), JSON.stringify(FULL))
    const r = resolveConfig(tmp)
    expect(r.workspaceRoot).toBe(tmp)
    expect(r.file).toBeNull()
    expect(r.missing.length).toBe(4)
  })

  it('readConfigFile：空的/空白字段视作未配置，落入 missing 而不是空字符串', () => {
    const f = path.join(tmp, '.dvd.config.json')
    fs.writeFileSync(f, JSON.stringify({ apiKey: '  ', model: 'm' }))
    const r = readConfigFile(f)
    expect(r.corrupt).toBeNull()
    expect(r.data.apiKey).toBeUndefined()
    expect(r.data.model).toBe('m')
  })
})

describe('queryUrl 模板校验', () => {
  it('含 {task_id} 占位符 → 通过', () => {
    expect(queryUrlError('https://apihost.example/tasks/{task_id}')).toBeNull()
  })
  it('缺占位符 → 报错（轮询走投无路，必须拦住）', () => {
    expect(queryUrlError('https://apihost.example/tasks')).toContain('{task_id}')
  })
})