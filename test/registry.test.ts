// test/registry.test.ts — 适配器配置解析（.dvd.config.json 多 adapter 按 name 对应）
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  loadAdaptersConfig, resolveAdapter, describeAdapters,
  SUPPORTED_ADAPTERS, DEFAULT_ADAPTER, ADAPTER_CONFIG_FILE,
} from '../src/adapter/registry.js'

let ws: string

function writeCfg(content: string | null) {
  const p = path.join(ws, ADAPTER_CONFIG_FILE)
  if (content === null) { fs.rmSync(p, { force: true }); return }
  fs.writeFileSync(p, content)
}

beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'dvd-adapter-')) })
afterEach(() => { fs.rmSync(ws, { recursive: true, force: true }) })

describe('适配器配置 .dvd.config.json', () => {
  it('缺失文件 → 空集合；resolve 走环境变量兜底（configured=false）', () => {
    expect(loadAdaptersConfig(ws)).toEqual([])
    const r = resolveAdapter(ws, 'seedance')
    expect(r.configured).toBe(false)
    expect(r.apiKey).toBeUndefined()
  })

  it('多 adapter 配置，按 name 字段对应', () => {
    writeCfg(JSON.stringify({
      adapters: [
        { name: 'seedance', baseUrl: 'https://api.a.com', apiKey: 'sk-a', model: 'seedance-2.5' },
        { name: 'xiaoyunque', baseUrl: 'https://api.b.com', apiKey: 'sk-b' },
      ],
    }))
    const a = resolveAdapter(ws, 'seedance')
    expect(a.configured).toBe(true)
    expect(a.apiKey).toBe('sk-a')
    expect(a.baseUrl).toBe('https://api.a.com')
    expect(a.model).toBe('seedance-2.5')
    const b = resolveAdapter(ws, 'xiaoyunque')
    expect(b.apiKey).toBe('sk-b')
    // 未配置的 name：configured=false，且不拿别的 key
    expect(resolveAdapter(ws, 'vchui').configured).toBe(false)
  })

  it('apiKey 留空 → 环境变量兜底（NAME大写_API_KEY）', () => {
    writeCfg(JSON.stringify({ adapters: [{ name: 'seedance', apiKey: '' }] }))
    process.env.SEEDANCE_API_KEY = 'sk-from-env'
    expect(resolveAdapter(ws, 'seedance').apiKey).toBe('sk-from-env')
    process.env.XIAOYUNQUE_API_KEY = 'sk-xyq'
    const r = resolveAdapter(ws, 'xiaoyunque')
    expect(r.apiKey).toBe('sk-xyq')
    delete process.env.SEEDANCE_API_KEY
    delete process.env.XIAOYUNQUE_API_KEY
  })

  it('文件 apiKey 优先于环境变量', () => {
    writeCfg(JSON.stringify({ adapters: [{ name: 'seedance', apiKey: 'sk-file' }] }))
    process.env.SEEDANCE_API_KEY = 'sk-env'
    expect(resolveAdapter(ws, 'seedance').apiKey).toBe('sk-file')
    delete process.env.SEEDANCE_API_KEY
  })

  it('损坏 JSON 不抛错，按空集合处理', () => {
    writeCfg('{ bad json')
    expect(loadAdaptersConfig(ws)).toEqual([])
    expect(resolveAdapter(ws, 'seedance').configured).toBe(false)
  })

  it('describeAdapters 概览标记未实现客户端与 key 来源', () => {
    writeCfg(JSON.stringify({ adapters: [
      { name: 'seedance', apiKey: 'sk-x' },
      { name: 'xiaoyunque' },
    ] }))
    const s = describeAdapters(ws)
    expect(s).toContain('seedance key=file')
    expect(s).toContain('xiaoyunque（客户端未实现）')
    expect(DEFAULT_ADAPTER).toBe('seedance')
    expect(SUPPORTED_ADAPTERS).toEqual(['seedance'])
  })
})