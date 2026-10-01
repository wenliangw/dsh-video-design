// test/foundation.test.ts — 四要素基础卡：泛型校验（必填/枚举/冲突/引用）+ 渲染 + 模板
// 纪律验证点：校验规则不写在测试里，只断言「机制行为」——文案与枚举来自 doctrine/foundation.md。
import { describe, it, expect } from 'vitest'
import {
  validateFoundation, renderFoundation, foundationTemplate, loadFoundationSpec,
  type Foundation,
} from '../src/adapters/seedance/foundation.js'

const base = (): Foundation => ({
  time: { period: '放学傍晚', lightState: '夕阳暖光', sequence: '连续' },
  space: {
    location: '校园梧桐林荫道',
    geometry: { roadDirection: 'depth' },
    camera: { side: '道路右侧', axis: '角色A恒画左' },
    traffic: { screenPath: 'away-from-camera', note: '向画面深处走远' },
  },
  characters: [
    { id: 'A', ref: '回眸少女', position: { screen: 'left', depth: 'mid' }, facing: '向画面深处', motion: '推车缓行' },
  ],
  events: [
    { seq: 1, who: ['A'], action: '推车沿路行进', durationSecs: 4 },
  ],
})

describe('四要素基础卡校验', () => {
  it('规范文件可装载（机器锚在场）', () => {
    const spec = loadFoundationSpec()
    expect(spec.required.length).toBeGreaterThan(0)
    expect(Object.keys(spec.enums)).toContain('space.geometry.roadDirection')
    expect(spec.conflicts.length).toBeGreaterThan(0)
    expect(spec.example).toBeTruthy()
  })

  it('缺失 foundation → 拒绝', () => {
    const errors = validateFoundation(undefined)
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('缺失')
  })

  it('合法四要素卡 → 零错误', () => {
    expect(validateFoundation(base())).toEqual([])
  })

  it('道路纵深 × 横向动线 → 冲突拦截（历史事故：横穿马路）', () => {
    const f = base()
    f.space.traffic.screenPath = 'left-to-right'
    const errors = validateFoundation(f)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('横穿')
  })

  it('道路横铺 × 纵深动线 → 冲突拦截', () => {
    const f = base()
    f.space.geometry.roadDirection = 'lateral'
    f.space.traffic.screenPath = 'toward-camera'
    expect(validateFoundation(f).length).toBeGreaterThan(0)
  })

  it('事件引用未声明角色 → 拦截', () => {
    const f = base()
    f.events[0].who = ['B']
    const errors = validateFoundation(f)
    expect(errors.some(e => e.includes('未在 characters 声明'))).toBe(true)
  })

  it('角色编号重复 → 拦截', () => {
    const f = base()
    f.characters.push({ ...f.characters[0], id: 'A', ref: '女同学' })
    const errors = validateFoundation(f)
    expect(errors.some(e => e.includes('重复'))).toBe(true)
  })

  it('空事件序列 → 拦截；空人物数组（空镜）→ 放行', () => {
    const f = base()
    f.events = []
    expect(validateFoundation(f).length).toBeGreaterThan(0)
    f.events = [{ seq: 1, who: ['环境'], action: '风吹梧桐叶' }]
    f.characters = []
    expect(validateFoundation(f)).toEqual([])
  })

  it('枚举非法值 → 拦截并列出允许值', () => {
    const f = base()
    f.characters[0].position.screen = 'top' as never
    const errors = validateFoundation(f)
    expect(errors.some(e => e.includes('非法值') && e.includes('left'))).toBe(true)
  })

  it('渲染：四要素先于拍法成句', () => {
    const s = renderFoundation(base())
    expect(s).toContain('时间')
    expect(s).toContain('校园梧桐林荫道')
    expect(s).toContain('回眸少女')
    expect(s).toContain('推车沿路行进')
    expect(s).toContain('动线')
  })

  it('可复制模板是合法 JSON 且含 foundation 键', () => {
    const t = foundationTemplate()
    const json = t.slice(0, t.indexOf('枚举速查'))
    const obj = JSON.parse(json) as { foundation: { time: { period: string } } }
    expect(obj.foundation.time.period).toBe('放学傍晚')
  })
})