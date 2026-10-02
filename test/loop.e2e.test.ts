// test/loop.e2e.test.ts —— 真实 HTTP 全链路验证（本地 mock 服务端，零外部网络、零计费）
//
// 验证「只发起模型调用」的完整机械闭环：用户给的完整地址原样使用 → POST 请求体正是
// model+content[text=prompt] → Bearer 鉴权 → 查询 200 → 成片地址提取 → 下载字节落地。
// 服务端是 node:http 本地监听器，任何时候可复跑，不依赖任何厂商配置。

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as http from 'node:http'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  createGeneration, getTask, downloadVideo, saveFile, buildQueryUrl, isTerminal, isDone,
} from '../src/adapters/seedance/seedance.js'

let server: http.Server
let port = 0
let sawCreateUrl = ''
let sawAuth = ''
let sawBody: any = null
let sawQueryUrl = ''

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/tasks') {
      let raw = ''
      req.on('data', c => { raw += c })
      req.on('end', () => {
        sawCreateUrl = req.url!
        sawAuth = String(req.headers.authorization ?? '')
        try { sawBody = JSON.parse(raw) } catch { sawBody = null }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ id: 'task-7' }))
      })
      return
    }
    if (req.method === 'GET' && req.url === '/tasks/task-7') {
      sawQueryUrl = req.url!
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'succeeded', content: { video_url: `http://127.0.0.1:${port}/v.mp4` } }))
      return
    }
    if (req.method === 'GET' && req.url === '/v.mp4') {
      res.writeHead(200, { 'Content-Type': 'video/mp4' })
      res.end(Buffer.from([0x01, 0x02, 0x03, 0x04]))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  port = (server.address() as unknown as { port: number }).port
})

afterAll(async () => {
  await new Promise<void>(r => server.close(() => r()))
})

describe('真实 HTTP 全链路：创建 → 查询 → 下载（本地 mock 厂商）', () => {
  it('queryUrl 模板替换：{task_id} → 任务 ID，其余逐字节原样', () => {
    expect(buildQueryUrl(`http://127.0.0.1:${port}/tasks/{task_id}`, 'task-7')).toBe(`http://127.0.0.1:${port}/tasks/task-7`)
  })

  it('创建：POST 打到用户给的完整地址、Bearer 鉴权、请求体=model+content[text=纯提示词]', async () => {
    const sub = await createGeneration({
      createUrl: `http://127.0.0.1:${port}/tasks`,
      apiKey: 'k-1',
      body: { model: 'm-1', content: [{ type: 'text', text: '纯提示词' }] },
    })
    expect(sub).toEqual({ task_id: 'task-7', status: 'pending' })
    expect(sawCreateUrl).toBe('/tasks')
    expect(sawAuth).toBe('Bearer k-1')
    expect(sawBody).toEqual({ model: 'm-1', content: [{ type: 'text', text: '纯提示词' }] })
  })

  it('查询：succeeded → 终态判定 + 成片地址提取', async () => {
    const st = await getTask({ queryUrl: buildQueryUrl(`http://127.0.0.1:${port}/tasks/{task_id}`, 'task-7'), apiKey: 'k-1' })
    expect(sawQueryUrl).toBe('/tasks/task-7')
    expect(st.status).toBe('succeeded')
    expect(isTerminal(st.status)).toBe(true)
    expect(isDone(st.status)).toBe(true)
    expect(st.video_url).toBe(`http://127.0.0.1:${port}/v.mp4`)
  })

  it('下载：字节完整落地到文件', async () => {
    const buf = await downloadVideo(`http://127.0.0.1:${port}/v.mp4`)
    expect(Buffer.from(buf).equals(Buffer.from([0x01, 0x02, 0x03, 0x04]))).toBe(true)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2loop-'))
    const mp4 = path.join(dir, 't.mp4')
    saveFile(mp4, buf)
    expect(fs.readFileSync(mp4).equals(Buffer.from([0x01, 0x02, 0x03, 0x04]))).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})