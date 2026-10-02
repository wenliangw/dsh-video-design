// test/anchor.test.ts —— 会话工作区起点：exec.agent.session.header.cwd（宿主源码考证事实的回归测试）
//
// 2026-10-02 用户报告的真实缺陷链：
// ①最初的实现起点=process.cwd()（服务器进程启动目录）——服务器开在 /home/7c/mesync，
//   用户视频会话工作区在 /home/7c/videos（兄弟目录），向上遍历永远够不到。
// ②第一轮修复绕了 ctx.sessions.get(id)（未经考证的服务猜测）。
// ③最终按宿主类型定义直连：ToolRunContext.agent（agent loop 设置）→ Agent.session（活会话）
//   → Session.header（always present）→ SessionHeader.cwd（会话创建时的绝对工作目录）。
//   佐证：master 源码注释「工具侧没有 agent 引用时，用 process.cwd() 兜底」。
// 本测试用纯桩对象模拟 exec；任何一步缺失/异常都必须安全回落 null。

import { describe, it, expect } from 'vitest'
import { sessionWorkspace } from '../src/agent/tools.js'

// tools.ts 直接 import 没问题，sessionWorkspace 不触碰插件服务（纯对象访问 + try/catch）。

function stubExec(agent?: unknown): unknown {
  return { agent }
}
function stubAgent(session?: unknown): unknown {
  return { session }
}
function stubSession(cwd?: unknown): unknown {
  return { header: { cwd } }
}

describe('sessionWorkspace 会话工作区（exec.agent.session.header.cwd）', () => {
  it('完整链路 → 会话创建时的绝对工作目录', () => {
    const exec = stubExec(stubAgent(stubSession('/home/7c/videos')))
    expect(sessionWorkspace(exec)).toBe('/home/7c/videos')
  })

  it('execute 上下文无 agent → null（agent loop 未设置，回退进程目录）', () => {
    expect(sessionWorkspace(stubExec(undefined))).toBeNull()
  })

  it('agent 无 session 字段 → null（防御）', () => {
    expect(sessionWorkspace(stubExec(stubAgent(undefined)))).toBeNull()
  })

  it('session 无 header → null（文档：Session.header always present，防御未来变化）', () => {
    expect(sessionWorkspace(stubExec(stubAgent({})))).toBeNull()
  })

  it('header 无 cwd → null（宿主文档：会话可无 cwd，必须回退）', () => {
    expect(sessionWorkspace(stubExec(stubAgent(stubSession(undefined))))).toBeNull()
  })

  it('cwd 为空字符串 → null（视同未提供）', () => {
    expect(sessionWorkspace(stubExec(stubAgent(stubSession(''))))).toBeNull()
  })

  it('cwd 非字符串 → null（类型不符不采用）', () => {
    expect(sessionWorkspace(stubExec(stubAgent(stubSession(42))))).toBeNull()
  })

  it('属性访问抛异常 → null 而不是漏出去（防御）', () => {
    const bomb = new Proxy({}, { get: () => { throw new Error('boom') } })
    expect(sessionWorkspace(stubExec(bomb))).toBeNull()
  })
})