// test/adapter.test.ts —— 最小调用闭环：构建请求体 / 提交归一化 / 状态词 / 成片提取 / 落盘
import { describe, it, expect, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  buildBody, createGeneration, getTask, isTerminal, isDone, downloadVideo, saveFile,
} from '../src/adapters/seedance/seedance.js'
import { TASK_STATUS, TERMINAL_STATUSES, DONE_STATUSES, HTTP_SEMANTICS } from '../src/adapters/seedance/contract.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildBody 请求体构建', () => {
  it('骨架 = model + content[text=prompt 原样]，extra 合并在后', () => {
    const { body } = buildBody('user-model', '一句纯提示词', { duration: 5, resolution: '720p' })
    expect(body.model).toBe('user-model')
    expect(body.content).toEqual([{ type: 'text', text: '一句纯提示词' }])
    expect(body.duration).toBe(5)
    expect(body.resolution).toBe('720p')
  })

  it('extra 试图覆盖 model/content → 剥离并报告（插件保持这两个字段）', () => {
    const { body, stripped } = buildBody('user-model', 'p', { model: 'evil', content: [], duration: 4 })
    expect(stripped).toEqual(['model', 'content'])
    expect(body.model).toBe('user-model')
    expect(body.content[0].text).toBe('p')
    expect(body.duration).toBe(4)
  })
})

describe('createGeneration / getTask 调用闭环（mock fetch，URL 全来自参数）', () => {
  it('提交：POST 用户给的完整地址、Bearer 鉴权、响应 id → 归一化 task_id+pending', async () => {
    let calledUrl = ''
    let calledBody: any = null
    let calledAuth = ''
    vi.stubGlobal('fetch', async (url: any, init: any) => {
      calledUrl = String(url)
      calledBody = JSON.parse(init.body)
      calledAuth = init.headers.Authorization
      return { ok: true, json: async () => ({ id: 'task-42' }) } as any
    })
    const r = await createGeneration({
      createUrl: 'https://user-host.example/api/v1/tasks',
      apiKey: 'k-secret',
      body: { model: 'm', content: [{ type: 'text', text: 'p' }] },
    })
    expect(calledUrl).toBe('https://user-host.example/api/v1/tasks') // 用户地址原样使用，无任何拼接
    expect(calledAuth).toBe('Bearer k-secret')
    expect(calledBody).toEqual({ model: 'm', content: [{ type: 'text', text: 'p' }] })
    expect(r).toEqual({ task_id: 'task-42', status: 'pending' })
  })

  it('提交失败：HTTP 语义读契约表，中文报错', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false, status: 401, json: async () => ({ error: { message: 'bad key' } }),
    }) as any)
    await expect(createGeneration({
      createUrl: 'https://user-host.example/api/v1/tasks',
      apiKey: 'k',
      body: { model: 'm', content: [{ type: 'text', text: 'p' }] },
    })).rejects.toThrow(/鉴权/)
  })

  it('查询非终态：running → 非终态、无成片', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ status: 'running' }) }) as any)
    const st = await getTask({ queryUrl: 'https://user-host.example/tasks/t-1', apiKey: 'k' })
    expect(st.status).toBe('running')
    expect(st.video_url).toBeUndefined()
    expect(isTerminal(st.status)).toBe(false)
    expect(isDone(st.status)).toBe(false)
  })

  it('查询成功：succeeded → 终态 + 提取 content.video_url', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true, json: async () => ({ status: 'succeeded', content: { video_url: 'https://cdn.example/v.mp4' } }),
    }) as any)
    const st = await getTask({ queryUrl: 'https://user-host.example/tasks/t-1', apiKey: 'k' })
    expect(st.video_url).toBe('https://cdn.example/v.mp4')
    expect(isTerminal(st.status)).toBe(true)
    expect(isDone(st.status)).toBe(true)
  })

  it('下载成片：字节落盘（mock fetch 返回二进制）', async () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02])
    vi.stubGlobal('fetch', async () => ({ ok: true, arrayBuffer: async () => bytes.buffer }) as any)
    const buf = await downloadVideo('https://cdn.example/v.mp4')
    expect(Buffer.from(buf).equals(Buffer.from(bytes))).toBe(true)
  })

  it('saveFile：自动建目录写入', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2shot-'))
    const f = path.join(dir, 'sub', 'a.json')
    saveFile(f, '{"x":1}')
    expect(JSON.parse(fs.readFileSync(f, 'utf-8'))).toEqual({ x: 1 })
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('契约词汇（只有响应语义，无模型/地址事实）', () => {
  it('终态集合 = succeeded/failed/expired；成功态 = succeeded', () => {
    expect(TERMINAL_STATUSES).toEqual([TASK_STATUS.succeeded, TASK_STATUS.failed, TASK_STATUS.expired])
    expect(DONE_STATUSES).toEqual([TASK_STATUS.succeeded])
    expect(HTTP_SEMANTICS['401']).toContain('鉴权')
  })
})