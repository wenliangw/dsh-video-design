// test/db.test.ts — 决策链数据层：insert/query/update roundtrip
import { describe, it, expect, afterAll } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  initDB, closeDB, insertDecision, getRecentDecisions, getDecisionById,
  updateDecisionOutcome, registerStory, listStories,
} from '../src/db/index.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-video-db-'))
}

describe('决策链数据层', () => {
  const ws = tmpDir()
  initDB(ws)

  afterAll(() => { closeDB(); fs.rmSync(ws, { recursive: true, force: true }) })

  it('story 注册幂等（同 path 返回既有行）', () => {
    const a = registerStory(path.join(ws, 'story-a'), 'story-a')
    const b = registerStory(path.join(ws, 'story-a'), 'story-a')
    expect(b.id).toBe(a.id)
    expect(listStories().length).toBe(1)
  })

  it('insert → recall：全字段 roundtrip（含 JSON 列）', () => {
    const node = {
      id: 'test-1',
      created_at: new Date().toISOString(),
      session_id: null,
      decision: '定用荷兰角开场',
      rationale: '悬疑张力与主题一致',
      trigger: '用户否定平淡开场',
      evidence: null,
      outcome: 'adopted' as const,
      caused_by: null,
      supersedes: null,
      alternatives: [{ option: '平淡正打', why_not: '张力不足' }],
      taste_signals: [{ signal: '偏爱戏剧性开场', context: '否定平淡开场' }],
      scopes: ['tastes/composition'],
    }
    insertDecision(node)
    const got = getRecentDecisions(1)[0]
    expect(got.id).toBe('test-1')
    expect(got.alternatives[0].option).toBe('平淡正打')
    expect(got.taste_signals[0].signal).toBe('偏爱戏剧性开场')
    expect(got.scopes).toEqual(['tastes/composition'])
  })

  it('supersedes 闭环：updateDecisionOutcome 把旧节点标 refined/reverted', () => {
    insertDecision({
      id: 'old-1', created_at: new Date().toISOString(), session_id: null,
      decision: '旧方案', rationale: '旧理由', trigger: null, evidence: null,
      outcome: 'adopted', caused_by: null, supersedes: null,
      alternatives: [], taste_signals: [], scopes: [],
    })
    expect(updateDecisionOutcome('old-1', 'refined')).toBe(true)
    expect(getDecisionById('old-1')!.outcome).toBe('refined')
    expect(updateDecisionOutcome('old-1', 'reverted')).toBe(true)
    expect(getDecisionById('old-1')!.outcome).toBe('reverted')
    expect(updateDecisionOutcome('not-exist', 'refined')).toBe(false)
  })
})