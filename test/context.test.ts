// test/context.test.ts — 注入文本构建（提示词全部文件驱动，代码不写死文案）
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCapabilities, buildDoctrineGuide } from '../src/agent/context.js'

const shippedCapabilities = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'templates', 'agents', 'CAPABILITIES.md'), 'utf-8')
const shippedAgents = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'templates', 'agents', 'AGENT_TEMPLATE.md'), 'utf-8')

describe('注入文本构建（文件驱动）', () => {
  it('航运能力速览母版自带标题与激活三态（dvd 介绍并入速览表）', () => {
    expect(shippedCapabilities.startsWith('# dsh-video-design 能力速览')).toBe(true)
    expect(shippedCapabilities).toContain('video_init')
    expect(shippedCapabilities).toContain('generate_shot')
    expect(shippedCapabilities).toContain('用户未表意')
    expect(shippedCapabilities).toContain('三阶层能力库')
  })

  it('无工作区 → 注入航运母版原文（代码不加任何包裹文案）', () => {
    expect(buildCapabilities(null, shippedCapabilities)).toBe(shippedCapabilities)
  })

  it('工作区 .dvd/capabilities.md 用户版优先；缺失/空白回退母版', () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'dvd-cap-'))
    // 缺失 → 母版
    expect(buildCapabilities(ws, shippedCapabilities)).toBe(shippedCapabilities)
    // 用户版 → 用户版原文
    fs.mkdirSync(path.join(ws, '.dvd'), { recursive: true })
    fs.writeFileSync(path.join(ws, '.dvd', 'capabilities.md'), '# 我的速览\n自定义内容')
    expect(buildCapabilities(ws, shippedCapabilities)).toBe('# 我的速览\n自定义内容')
    // 空白 → 回退母版
    fs.writeFileSync(path.join(ws, '.dvd', 'capabilities.md'), '')
    expect(buildCapabilities(ws, shippedCapabilities)).toBe(shippedCapabilities)
    fs.rmSync(ws, { recursive: true, force: true })
  })

  it('心法总纲：故事 AGENTS.md 原文优先，缺失回退航运总纲母版', () => {
    const story = fs.mkdtempSync(path.join(os.tmpdir(), 'dvd-story-'))
    expect(buildDoctrineGuide(story, shippedAgents)).toBe(shippedAgents)
    fs.writeFileSync(path.join(story, 'AGENTS.md'), '# 用户的总纲\n用户写了内容')
    expect(buildDoctrineGuide(story, shippedAgents)).toBe('# 用户的总纲\n用户写了内容')
    fs.rmSync(story, { recursive: true, force: true })
  })
})