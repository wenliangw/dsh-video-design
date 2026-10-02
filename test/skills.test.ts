// test/skills.test.ts —— 插件自带 skill 注册（提示词编写心法是 dsh-video-design 的能力，不是 .mesync）
//
// 回归点（用户纠正过的误区）：
// - 提示词编写 skill 属于插件本身，通过 ctx.skills.register 注册进宿主 skill 目录；
// - .mesync 是代码开发记忆系统，不放插件功能。
// 本测试 mock ctx.skills.register，断言注册名合规、内容要点齐全、零内置事实（无 URL/型号串）。

import { describe, it, expect, vi } from 'vitest'
import { registerPromptSkill, PROMPT_SKILL_NAME } from '../src/agent/skills.js'

describe('registerPromptSkill 插件自带技能注册', () => {
  it('注册名 = video-shot-prompt 且是 kebab-case', () => {
    const registered: any[] = []
    const ctx = {
      skills: {
        register: vi.fn((s: unknown) => { registered.push(s); return () => {} }),
      },
    }
    registerPromptSkill(ctx as any)
    expect(ctx.skills.register).toHaveBeenCalledTimes(1)
    const skill = registered[0]
    expect(skill.name).toBe('video-shot-prompt')
    expect(PROMPT_SKILL_NAME).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/) // 宿主 skill 命名语法
  })

  it('内容含四段式核心要点（骨架完整才发布）', () => {
    const registered: any[] = []
    const ctx = { skills: { register: vi.fn((s: unknown) => { registered.push(s); return () => {} }) } }
    registerPromptSkill(ctx as any)
    const body: string = registered[0].content
    // 四段式：场景常量 / 人物定卡 / 动作拍 / 环境句
    for (const key of ['场景常量', '人物定卡', '动作拍', '环境句']) {
      expect(body).toContain(key)
    }
    // 编写纪律核心：每拍一个主动词、禁拍摄手法词、人物四件特征
    for (const key of ['每拍独立一句', '发型 / 上装 / 下装 / 配饰', '拍摄手法词', '提交前自检']) {
      expect(body).toContain(key)
    }
  })

  it('技能内容零内置事实：无完整网址、无模型版本串（与红线同一口径）', () => {
    const registered: any[] = []
    const ctx = { skills: { register: vi.fn((s: unknown) => { registered.push(s); return () => {} }) } }
    registerPromptSkill(ctx as any)
    const body: string = registered[0].content
    expect(body).not.toMatch(/https?:\/\//)
    expect(body).not.toMatch(/seedance-\d|doubao/i)
  })

  it('宿主无 skills 服务 → 静默跳过不抛（最小核可降级加载）', () => {
    expect(() => registerPromptSkill({} as any)).not.toThrow()
  })
})