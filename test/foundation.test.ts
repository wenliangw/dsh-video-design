// test/foundation.test.ts — 基础面卡（景→人→交互→动线）：泛型校验（必填/枚举/冲突/引用/持有物重述）+ 渲染 + 模板
// 纪律验证点：校验规则不写在测试里，只断言「机制行为」——文案与枚举来自 doctrine/foundation.md。
import { describe, it, expect } from 'vitest'
import {
  validateFoundation, renderFoundation, foundationTemplate, loadFoundationSpec,
  type Foundation,
} from '../src/adapters/seedance/foundation.js'

const base = (): Foundation => ({
  scene: {
    location: '校园梧桐林荫道',
    period: '放学傍晚',
    lightState: '夕阳暖光',
    anchors: { ground: '柏油人行道', lightSource: '夕阳自左侧逆光', scaleRef: '成排梧桐·等距灯柱' },
    geometry: { roadDirection: 'depth' },
    camera: { side: '道路右侧', axis: '角色A恒画左' },
    traffic: { screenPath: 'away-from-camera', note: '向画面深处走远' },
  },
  characters: [
    { id: 'A', ref: '回眸少女', proportions: '少女比同学高约半头', position: { screen: 'left', depth: 'mid' }, facing: '向画面深处', motion: '推车缓行' },
  ],
  interaction: {
    groundContact: '双脚踩实地面、阴影贴地',
    occlusion: '人物在梧桐行道间',
    scaleRatio: '身高约灯柱一半',
    propStates: 'A全程随身：银灰色旧单车',
  },
  timeline: {
    events: [
      { seq: 1, who: ['A'], action: '推着银灰色旧单车沿路行进', durationSecs: 4 },
    ],
  },
})

describe('基础面卡校验', () => {
  it('规范文件可装载（机器锚在场）', () => {
    const spec = loadFoundationSpec()
    expect(spec.required.length).toBeGreaterThan(0)
    expect(Object.keys(spec.enums)).toContain('scene.geometry.roadDirection')
    expect(spec.conflicts.length).toBeGreaterThan(0)
    expect(spec.optionalBlocks).toContain('timeline')
    expect(spec.example).toBeTruthy()
  })

  it('缺失 foundation → 拒绝', () => {
    const errors = validateFoundation(undefined)
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('缺失')
  })

  it('合法基础面卡 → 零错误', () => {
    expect(validateFoundation(base())).toEqual([])
  })

  it('动线块可整块缺省（静态镜合法）', () => {
    const f = base()
    delete (f as Partial<Foundation>).timeline
    expect(validateFoundation(f)).toEqual([])
  })

  it('道路纵深 × 横向动线 → 冲突拦截（历史事故：横穿马路）', () => {
    const f = base()
    f.scene.traffic.screenPath = 'left-to-right'
    const errors = validateFoundation(f)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('横穿')
  })

  it('道路横铺 × 纵深动线 → 冲突拦截', () => {
    const f = base()
    f.scene.geometry.roadDirection = 'lateral'
    f.scene.traffic.screenPath = 'toward-camera'
    expect(validateFoundation(f).length).toBeGreaterThan(0)
  })

  it('交互块字段缺失 → 逐个拦截', () => {
    const f = base() as unknown as { interaction: Record<string, string> }
    f.interaction.groundContact = ''
    const errors = validateFoundation(f as Foundation)
    expect(errors.some(e => e.includes('接触落地'))).toBe(true)
  })

  it('景块三锚缺失 → 拦截（比例参照系悬空，历史事故：腿身比例失调）', () => {
    const f = base()
    delete (f.scene.anchors as Partial<typeof f.scene.anchors>).scaleRef
    const errors = validateFoundation(f)
    expect(errors.some(e => e.includes('尺度参照锚'))).toBe(true)
  })

  it('人物骨架比例缺失 → 拦截', () => {
    const f = base()
    f.characters[0].proportions = ''
    const errors = validateFoundation(f)
    expect(errors.some(e => e.includes('骨架比例'))).toBe(true)
  })

  it('事件引用未声明角色 → 拦截', () => {
    const f = base()
    f.timeline!.events[0].who = ['B']
    const errors = validateFoundation(f)
    expect(errors.some(e => e.includes('未在 characters 声明'))).toBe(true)
  })

  it('角色编号重复 → 拦截', () => {
    const f = base()
    f.characters.push({ ...f.characters[0], id: 'A', ref: '女同学' })
    const errors = validateFoundation(f)
    expect(errors.some(e => e.includes('重复'))).toBe(true)
  })

  it('动线事件为空数组 → 拦截；空人物数组（空镜）→ 放行', () => {
    const f = base()
    f.timeline = { events: [] }
    expect(validateFoundation(f).length).toBeGreaterThan(0)
    f.timeline = { events: [{ seq: 1, who: ['环境'], action: '风吹梧桐叶' }] }
    f.characters = []
    f.interaction = { ...f.interaction, propStates: '无随身道具' }
    expect(validateFoundation(f)).toEqual([])
  })

  it('枚举非法值 → 拦截并列出允许值', () => {
    const f = base()
    f.characters[0].position.screen = 'top' as never
    const errors = validateFoundation(f)
    expect(errors.some(e => e.includes('非法值') && e.includes('left'))).toBe(true)
  })

  it('持有物未在事件动作中重述 → 拦截（历史事故：S006 人走后车留原地）', () => {
    const f = base()
    f.characters[0].props = ['银灰色旧单车（全程推行）']
    f.timeline!.events[0].action = '沿路边走边聊走远'
    const errors = validateFoundation(f)
    expect(errors.some(e => e.includes('未重述') && e.includes('银灰色旧单车'))).toBe(true)
  })

  it('持有物重述纪律：角色不参与结尾事件 → 不改事件不放行', () => {
    // 道具重述只在「该角色出场的事件」上强制;角色出场的每个事件都必须带道具名
    const f = base()
    f.characters[0].props = ['银灰色旧单车（全程推行）']
    f.timeline!.events = [
      { seq: 1, who: ['A'], action: '推着银灰色旧单车沿路行进', durationSecs: 3 },
      { seq: 2, who: ['环境'], action: '风吹梧桐叶簌簌', durationSecs: 1 },
      { seq: 3, who: ['A'], action: '停下回眸，扶稳银灰色旧单车', durationSecs: 1 },
    ]
    expect(validateFoundation(f)).toEqual([])
  })

  it('渲染：景先立（三锚在场），四块按主序成句', () => {
    const s = renderFoundation(base())
    expect(s).toContain('基础面｜')
    expect(s).toContain('景：校园梧桐林荫道')
    expect(s).toContain('地面柏油人行道')
    expect(s).toContain('光源夕阳自左侧逆光')
    expect(s).toContain('尺度参照成排梧桐')
    expect(s.indexOf('景：')).toBeLessThan(s.indexOf('人：'))
    expect(s.indexOf('人：')).toBeLessThan(s.indexOf('交互：'))
    expect(s.indexOf('交互：')).toBeLessThan(s.indexOf('动线：'))
  })

  it('渲染：静态无动线镜渲染「动线：静态无事件」', () => {
    const f = base()
    delete (f as Partial<Foundation>).timeline
    const s = renderFoundation(f)
    expect(s).toContain('动线：静态无事件')
  })

  it('持有物 props：合法声明 → 放行并渲染出「持」', () => {
    const f = base()
    f.characters[0].props = ['银灰色旧单车（全程推行）']
    f.timeline!.events[0].action = '推着银灰色旧单车沿路行进'
    expect(validateFoundation(f)).toEqual([])
    expect(renderFoundation(f)).toContain('持银灰色旧单车')
  })

  it('持有物 props：形态不符 → 拦截', () => {
    const f = base()
    f.characters[0].props = '带错了类型' as never
    const errors = validateFoundation(f)
    expect(errors.some(e => e.includes('道具名（状态）'))).toBe(true)
  })

  it('可复制模板是合法 JSON 且含 foundation 键', () => {
    const t = foundationTemplate()
    const json = t.slice(0, t.indexOf('枚举速查'))
    const obj = JSON.parse(json) as { foundation: { scene: { period: string; anchors: { ground: string } } } }
    expect(obj.foundation.scene.period).toBe('放学傍晚')
    expect(obj.foundation.scene.anchors.ground).toBe('柏油人行道')
  })
})