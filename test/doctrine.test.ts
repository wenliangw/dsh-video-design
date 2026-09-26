// test/doctrine.test.ts — 能力库装载 + 轴值校验
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAxes, loadCards, loadPresets, validateAxes, parseFrontmatter } from '../src/doctrine/index.js'

describe('doctrine 能力库', () => {
  it('装载 11 域词汇轴（8 内核封闭 + 3 扩展开放）', () => {
    const axes = loadAxes()
    expect(axes.length).toBe(11)
    const closed = axes.filter(a => a.kind === 'closed').map(a => a.key)
    const open = axes.filter(a => a.kind === 'open').map(a => a.key)
    expect(closed.sort()).toEqual(
      ['size', 'angle', 'movement', 'composition', 'lighting', 'color', 'pacing', 'format'].sort(),
    )
    expect(open.sort()).toEqual(['sound', 'vfx', 'performance'].sort())
    for (const a of axes) expect(a.values.length).toBeGreaterThan(2)
  })

  it('装载手法卡片（≥10 张、配方引用合法轴值）', () => {
    const axes = loadAxes()
    const byKey = new Map(axes.map(a => [a.key, a]))
    const cards = loadCards()
    expect(cards.length).toBeGreaterThanOrEqual(10)
    for (const c of cards) {
      expect(c.provenance).toBe('official')
      for (const [key, value] of Object.entries(c.recipe)) {
        const axis = byKey.get(key)
        expect(axis, `card ${c.id} recipe 引用未知轴 ${key}`).toBeDefined()
        if (axis!.kind === 'closed') {
          expect(axis!.values.some(v => v.id === value), `card ${c.id} ${key}=${value} 非法`).toBe(true)
        }
      }
    }
  })

  it('装载组合包（≥3 个、引用存在卡片、recipe 配方被装载器读出）', () => {
    const cardIds = new Set(loadCards().map(c => c.id))
    const presets = loadPresets()
    expect(presets.length).toBeGreaterThanOrEqual(3)
    for (const p of presets) {
      for (const id of p.cards) expect(cardIds.has(id), `preset ${p.id} 引用缺失卡 ${id}`).toBe(true)
      expect(p.emotionTags.length).toBeGreaterThan(0)
    }
    // recipe 是组合包的机器面配方（不吃进装载器 = schema 漂移，必须读出来）
    const epic = presets.find(p => p.id === 'preset-epic-entrance')
    expect(epic?.recipe).toEqual({ size: 'LS', color: 'teal-orange', vfx: 'particles', sound: 'epic-orchestra' })
  })

  it('封闭轴校验拦截非法值，开放轴放行', () => {
    const axes = loadAxes()
    expect(validateAxes({ size: 'XXL' }, axes)).toContainEqual(expect.stringContaining('非法'))
    expect(validateAxes({ size: 'CU' }, axes)).toEqual([])
    expect(validateAxes({ vfx: '任意新特效词' }, axes)).toEqual([])
    expect(validateAxes({ unknown_axis: 'x' }, axes)).toContainEqual(expect.stringContaining('未知轴'))
  })

  it('双面 md 解析 front-matter', () => {
    const axesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'templates', 'doctrine', 'axes')
    const md = fs.readFileSync(path.join(axesDir, '01-size.md'), 'utf-8')
    const { data, body } = parseFrontmatter(md)
    expect(data.key).toBe('size')
    expect(data.values.length).toBe(7)
    expect(body).toContain('景别')
  })
})