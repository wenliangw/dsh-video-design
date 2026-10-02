// test/config.test.ts —— 用户配置装载：文件 > 环境变量；缺什么只列什么；损坏显式报错
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  resolveConfig, findConfigFile, readConfigFile, queryUrlError,
} from '../src/workspace/config.js'

const FULL = {
  apiKey: 'key-abc',
  model: 'user-model-id',
  createUrl: 'https://apihost.example/tasks',
  queryUrl: 'https://apihost.example/tasks/{task_id}',
}
// 注意：测试里的 https 只出现在「用户配置模拟数据」，不在 src/ 源码（红线测试只扫 src/）。

let tmp: string
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

describe('resolveConfig 用户配置装载', () => {
  it('无配置文件无环境变量 → 四字段全部列入 missing（不内置任何默认，只列缺项）', () => {
    const r = resolveConfig(tmp)
    expect(r.file).toBeNull()
    expect(r.corrupt).toBeNull()
    expect([...r.missing].sort()).toEqual(['apiKey', 'createUrl', 'model', 'queryUrl'])
  })

  it('配置文件四字段齐 → 全解析、missing 空', () => {
    fs.writeFileSync(path.join(tmp, '.dvd.config.json'), JSON.stringify(FULL))
    const r = resolveConfig(tmp)
    expect(r.file).toBe(path.join(tmp, '.dvd.config.json'))
    expect(r.missing).toEqual([])
    expect(r.apiKey).toBe('key-abc')
    expect(r.model).toBe('user-model-id')
    expect(r.createUrl).toBe('https://apihost.example/tasks')
    expect(r.queryUrl).toBe('https://apihost.example/tasks/{task_id}')
  })

  it('文件缺 model，环境变量补上 → 合并成功；文件优先于环境变量', () => {
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

  it('只有环境变量 → 全走 env 通道，missing 空', () => {
    vi.stubEnv('SEEDANCE_API_KEY', 'env-key')
    vi.stubEnv('SEEDANCE_MODEL', 'env-model')
    vi.stubEnv('SEEDANCE_CREATE_URL', 'https://apihost.example/tasks')
    vi.stubEnv('SEEDANCE_QUERY_URL', 'https://apihost.example/tasks/{task_id}')
    const r = resolveConfig(tmp)
    expect(r.file).toBeNull()
    expect(r.apiKey).toBe('env-key')
    expect(r.missing).toEqual([])
  })

  it('配置文件 JSON 损坏 → corrupt 显式报错，不静默当没配置', () => {
    const f = path.join(tmp, '.dvd.config.json')
    fs.writeFileSync(f, '{ 这不是 JSON')
    const r = resolveConfig(tmp)
    expect(r.corrupt).not.toBeNull()
    expect(r.missing.length).toBeGreaterThan(0)
  })

  it('向上递归找配置文件：子目录里也能命中上级的 .dvd.config.json', () => {
    fs.writeFileSync(path.join(tmp, '.dvd.config.json'), JSON.stringify(FULL))
    const sub = path.join(tmp, 'a', 'b')
    fs.mkdirSync(sub, { recursive: true })
    expect(findConfigFile(sub)).toBe(path.join(tmp, '.dvd.config.json'))
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