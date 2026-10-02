// test/anchor.test.ts —— 工具目录锚点：会话工作区优先，回退 process.cwd()
//
// 2026-10-02 用户报告的真实缺陷回归测试（配置放在用户工作区 /home/7c/videos 却读不到）：
// 旧实现锚 process.cwd()（dsh 服务器进程启动目录），与「会话工作区」不是一回事——
// 用户在 /home/7c/videos 建的会话，配置也在那里，插件却按进程目录向上找，永远找不到。
// 修正为：execute 上下文 agent.id → ctx.sessions.get(id).header.cwd（dsh 会话创建时的工作目录）。
// 本测试用纯桩对象模拟 ctx/exec，任何一步缺失都必须安全回落 null。

import { describe, it, expect } from 'vitest'
import { sessionWorkspace } from '../src/agent/tools.js'

// tools.ts 直接 import 没问题，sessionWorkspace 不触碰插件服务（纯对象访问 + try/catch）。

function stubCtx(sessions: unknown): unknown {
  return { sessions }
}
function stubExec(agent?: { id?: unknown }): unknown {
  return { agent }
}

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