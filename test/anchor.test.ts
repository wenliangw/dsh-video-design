// test/anchor.test.ts —— 工具目录锚点：SEEDANCE_WORKSPACE > 会话工作区 > process.cwd()
//
// 2026-10-02 用户报告的真实缺陷回归测试：
// ①配置放在用户工作区 /home/7c/videos 却读不到——旧实现锚 process.cwd()（服务器进程启动目录），
//   与「会话工作区」不是一回事，向上找永远看不见隔壁目录的用户配置。
// ②进一步暴露：会话工作区也不等于「视频工作的家」——用户可能在任何项目的会话里调用视频插件
//   （例如在 /home/7c/mesync 开会话，配置在 /home/7c/videos）。最终定案：环境变量
//   SEEDANCE_WORKSPACE 固定视频工作区，优先级最高；其次会话工作区；兜底进程目录。
// 本测试用纯桩对象模拟 ctx/exec/env，任何一步缺失都必须安全回落。

import { describe, it, expect, afterEach, vi } from 'vitest'
import { sessionWorkspace, resolveAnchor } from '../src/agent/tools.js'

// tools.ts 直接 import 没问题，sessionWorkspace/resolveAnchor 不触碰插件服务（纯对象访问 + try/catch）。

function stubCtx(sessions: unknown): unknown {
  return { sessions }
}
function stubExec(agent?: { id?: unknown }): unknown {
  return { agent }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('sessionWorkspace 会话工作区解析', () => {
  it('agent.id + ctx.sessions.get → 会话 header.cwd（用户工作区）', () => {
    const ctx = stubCtx({ get: (_id: string) => ({ header: { cwd: '/home/7c/videos' } }) })
    const exec = stubExec({ id: 'session-1' })
    expect(sessionWorkspace(ctx as any, exec)).toBe('/home/7c/videos')
  })

  it('宿主无 sessions 服务 → null（非 dsh 宿主/旧宿主，回退进程 cwd）', () => {
    expect(sessionWorkspace({} as any, stubExec({ id: 's' }))).toBeNull()
  })

  it('execute 上下文无 agent → null', () => {
    const ctx = stubCtx({ get: () => ({ header: { cwd: '/x' } }) })
    expect(sessionWorkspace(ctx as any, stubExec(undefined))).toBeNull()
  })

  it('会话存在但 header 无 cwd → null（dsh 会话允许无 cwd，按文档回退）', () => {
    const ctx = stubCtx({ get: () => ({ header: {} }) })
    expect(sessionWorkspace(ctx as any, stubExec({ id: 's' }))).toBeNull()
  })

  it('sessions.get 抛异常 → null 而不是漏出去（防御）', () => {
    const ctx = stubCtx({ get: () => { throw new Error('boom') } })
    expect(sessionWorkspace(ctx as any, stubExec({ id: 's' }))).toBeNull()
  })

  it('agent.id 非字符串 → null', () => {
    const ctx = stubCtx({ get: () => ({ header: { cwd: '/x' } }) })
    expect(sessionWorkspace(ctx as any, stubExec({ id: 42 }))).toBeNull()
  })
})

describe('resolveAnchor 三级优先级', () => {
  const ctx = stubCtx({ get: (id: string) => ({ header: { cwd: id === 's-videos' ? '/home/7c/videos' : undefined } }) })
  const execInVideos = stubExec({ id: 's-videos' })

  it('设置了 SEEDANCE_WORKSPACE → 压过会话工作区（跨项目会话的修复）', () => {
    vi.stubEnv('SEEDANCE_WORKSPACE', '/home/7c/videos')
    expect(resolveAnchor(ctx as any, execInVideos)).toEqual({ dir: '/home/7c/videos', source: 'env' })
  })

  it('设置了 SEEDANCE_WORKSPACE（相对路径 → 绝对化）', () => {
    vi.stubEnv('SEEDANCE_WORKSPACE', 'videos')
    const r = resolveAnchor(ctx as any, execInVideos)
    expect(r.source).toBe('env')
    expect(r.dir).toMatch(/\/videos$/)
    expect(r.dir.startsWith('/')).toBe(true)
  })

  it('未设置 SEEDANCE_WORKSPACE → 会话工作区（在视频工作区开会话自然命中）', () => {
    vi.stubEnv('SEEDANCE_WORKSPACE', '')
    expect(resolveAnchor(ctx as any, execInVideos)).toEqual({ dir: '/home/7c/videos', source: 'session' })
  })

  it('既无 SEEDANCE_WORKSPACE 也无会话 → 进程启动目录兜底', () => {
    vi.stubEnv('SEEDANCE_WORKSPACE', '')
    expect(resolveAnchor({} as any, stubExec(undefined))).toEqual({ dir: process.cwd(), source: 'process' })
  })

  it('SEEDANCE_WORKSPACE 只有空格 → 视为未设置', () => {
    vi.stubEnv('SEEDANCE_WORKSPACE', '   ')
    expect(resolveAnchor(ctx as any, execInVideos)).toEqual({ dir: '/home/7c/videos', source: 'session' })
  })
})