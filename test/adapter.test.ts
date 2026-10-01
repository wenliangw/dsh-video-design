import { describe, it, expect } from 'vitest'
import {
  defaultBaseUrl,
  buildStandardSentence, buildVendorPrompt, clampPrompt, clampPromptReport,
  type PromptOverflow,
  validateReferenceInput, toRequest, estimate, extractVideoUrl,
  extraDoneStatuses, extraFailedStatuses, isTerminalStatus,
  resolveCapabilities,
  type FamilyCaps, type CapsOverride,
  type ShotJSON,
} from '../src/adapters/seedance/seedance.js'

const baseShot = (over: Partial<ShotJSON> = {}): ShotJSON => ({
  shot: {
    index: 'S001',
    subject: '少年在雨夜巷口回头',
    axes: {
      size: '近景', angle: '低角度仰拍', movement: '缓慢推近', composition: '中心对称',
      lighting: '冷色侧逆光', color: '青蓝', pacing: '慢节奏', vfx: '微尘悬浮', format: '16:9',
    },
  },
  ...over,
})

/** 常见家族风格的完整能力声明（测试夹具；真实值以用户 caps 声明为准） */
const capsFull = (over: Partial<CapsOverride> = {}): CapsOverride => ({
  durationRange: [4, 15],
  maxReferenceImages: 9,
  maxFirstLastFrame: 2,
  generateAudio: 'explicit-false',
  ...over,
})

const capsOf = (label: string, over: Partial<CapsOverride> = {}): FamilyCaps =>
  resolveCapabilities(label, capsFull(over)).caps!

describe('契约装载', () => {
  it('base URL 契约默认指向方舟', () => {
    expect(defaultBaseUrl()).toBe('https://ark.cn-beijing.volces.com')
  })
})

describe('两层提示词转译', () => {
  it('标准层固定子句顺序、可倒解析', () => {
    const s = buildStandardSentence(baseShot())
    expect(s).toContain('[全程] 少年在雨夜巷口回头')
    expect(s).toContain('镜头[size]近景')
    expect(s).toContain('镜头[color]青蓝')
  })
  it('厂商层叙述流注入 11 域扩展语与负向约束', () => {
    const s = buildVendorPrompt(baseShot({ constraints: { negatives: ['避免出现车辆'] } }))
    expect(s).toContain('少年在雨夜巷口回头')
    expect(s).toContain('景别近景')
    expect(s).toContain('避免：避免出现车辆')
  })
  it('prompt 超官方建议（500 字）按分句边界截断且主体在前', () => {
    const long = '少年' + '冲'.repeat(700) + '；尾部补充'
    const cut = clampPrompt(long)
    expect(cut.length).toBeLessThanOrEqual(501)
    expect(cut.startsWith('少年')).toBe(true)
  })
})

describe('家族能力解析（完全配置化，契约零内置）', () => {
  it('caps 四字段齐备 → 生效，family 取声明标签', () => {
    const r = resolveCapabilities('2.5', capsFull({ durationRange: [4, 30], maxReferenceImages: 30 }))
    expect(r.error).toBeNull()
    expect(r.caps!.family).toBe('2.5')
    expect(r.caps!.durationRange).toEqual([4, 30])
    expect(r.caps!.maxReferenceImages).toBe(30)
    expect(r.caps!.maxFirstLastFrame).toBe(2)
    expect(r.caps!.generateAudio).toBe('explicit-false')
  })

  it('generateAudio=omit 合法（1.0 系列风格声明）', () => {
    const r = resolveCapabilities('1.0pro', {
      durationRange: [2, 12], maxReferenceImages: 0, maxFirstLastFrame: 2, generateAudio: 'omit',
    })
    expect(r.error).toBeNull()
    expect(r.caps!.generateAudio).toBe('omit')
    expect(r.caps!.maxReferenceImages).toBe(0)
  })

  it('缺任一字段 → 拒绝并给可复制模板', () => {
    const r = resolveCapabilities('doubao-seedance-2-0-fast-260128', { durationRange: [4, 15] })
    expect(r.caps).toBeNull()
    expect(r.error).toContain('maxReferenceImages')
    expect(r.error).toContain('"caps"')
    const r0 = resolveCapabilities('doubao-seedance-2-0-fast-260128', undefined)
    expect(r0.caps).toBeNull()
    expect(r0.error).toContain('durationRange')
  })

  it('非法值显式报错', () => {
    expect(resolveCapabilities('x', capsFull({ durationRange: [30, 4] })).error).toContain('durationRange')
    expect(resolveCapabilities('x', capsFull({ generateAudio: 'audio-on' as never })).error).toContain('generateAudio')
    expect(resolveCapabilities('x', capsFull({ maxReferenceImages: -1 })).error).toContain('maxReferenceImages')
  })
})

describe('参考图校验（家族上限，能力来自用户 caps 声明）', () => {
  const seedance20fast = 'doubao-seedance-2-0-fast-1'
  const seedance10fast = 'doubao-seedance-1-0-pro-fast-1'
  const seedance10pro = 'doubao-seedance-1-0-pro-1'

  it('无图直通', () => {
    expect(validateReferenceInput(seedance10fast, 0, false, capsOf(seedance10fast, {
      durationRange: [2, 12], maxReferenceImages: 0, maxFirstLastFrame: 1, generateAudio: 'omit',
    }))).toBeNull()
  })
  it('1.0 pro fast 仅首帧 1 张（maxFirstLastFrame=1）', () => {
    const caps = capsOf(seedance10fast, {
      durationRange: [2, 12], maxReferenceImages: 0, maxFirstLastFrame: 1, generateAudio: 'omit',
    })
    expect(validateReferenceInput(seedance10fast, 1, false, caps)).toBeNull()
    expect(validateReferenceInput(seedance10fast, 2, false, caps)).toContain('最多支持 1 张')
  })
  it('maxReferenceImages=0 不支持参考图（reference_mode / 3+ 张）', () => {
    const caps = capsOf(seedance10pro, {
      durationRange: [2, 12], maxReferenceImages: 0, maxFirstLastFrame: 2, generateAudio: 'omit',
    })
    expect(validateReferenceInput(seedance10pro, 2, true, caps)).toContain('不支持参考图')
    expect(validateReferenceInput(seedance10pro, 3, false, caps)).toContain('不支持参考图生视频')
  })
  it('2.0 系列上限 9 张、2.5 上限 30 张（声明值）', () => {
    const caps20 = capsOf('2.0')
    expect(validateReferenceInput('doubao-seedance-2-0-1', 9, true, caps20)).toBeNull()
    expect(validateReferenceInput('doubao-seedance-2-0-1', 10, true, caps20)).toContain('上限 9 张')
    const caps25 = capsOf('2.5', { durationRange: [4, 30], maxReferenceImages: 30 })
    expect(validateReferenceInput('doubao-seedance-2-5-1', 30, true, caps25)).toBeNull()
    expect(validateReferenceInput('doubao-seedance-2-5-1', 31, true, caps25)).toContain('上限 30 张')
  })
  it('1.0 pro 支持首尾帧 2 张', () => {
    const caps = capsOf(seedance10pro, {
      durationRange: [2, 12], maxReferenceImages: 0, maxFirstLastFrame: 2, generateAudio: 'omit',
    })
    expect(validateReferenceInput(seedance10pro, 2, false, caps)).toBeNull()
  })
  it('用户声明把参考图上限改为 3', () => {
    const custom = capsOf('2.0fast', { maxReferenceImages: 3 })
    expect(validateReferenceInput('doubao-seedance-2-0-fast-1', 3, true, custom)).toBeNull()
    expect(validateReferenceInput('doubao-seedance-2-0-fast-1', 4, true, custom)).toContain('上限 3 张')
  })
})

describe('请求体映射（火山方舟形态）', () => {
  it('content 首条为 text，时长按用户 caps clamp，watermark=false', () => {
    const plan = toRequest(baseShot(), {
      model: 'doubao-seedance-2-0-1', duration: 3, resolution: '720p', aspectRatio: '16:9', referenceMode: false, referenceUrls: [],
      caps: capsOf('2.0'),
    })
    expect(plan.family).toBe('2.0')
    expect(plan.duration).toBe(4) // 3s 低于用户声明下限
    expect(plan.body.content[0]).toEqual({ type: 'text', text: plan.vendorPrompt })
    expect(plan.body.watermark).toBe(false)
    expect(plan.body.generate_audio).toBe(false)
    expect(plan.body.resolution).toBe('720p')
    expect(plan.body.ratio).toBe('16:9')
  })
  it('generateAudio=omit 不携带字段；duration 上限 clamp 12', () => {
    const plan = toRequest(baseShot(), {
      model: 'doubao-seedance-1-0-pro-1', duration: 30, resolution: '1080p', aspectRatio: '16:9', referenceMode: false, referenceUrls: [],
      caps: capsOf('1.0pro', {
        durationRange: [2, 12], maxReferenceImages: 0, maxFirstLastFrame: 2, generateAudio: 'omit',
      }),
    })
    expect(plan.family).toBe('1.0pro')
    expect(plan.duration).toBe(12)
    expect(plan.body).not.toHaveProperty('generate_audio')
  })
  it('两张图分配 first_frame/last_frame', () => {
    const plan = toRequest(baseShot(), {
      model: 'doubao-seedance-2-0-1', duration: 5, resolution: '720p', aspectRatio: '16:9', referenceMode: false,
      referenceUrls: ['https://a.example/1.png', 'https://a.example/2.png'],
      caps: capsOf('2.0'),
    })
    const imgs = plan.body.content.slice(1)
    expect(imgs.map(i => i.image_url!.role)).toEqual(['first_frame', 'last_frame'])
  })
  it('reference_mode 全图 reference_image（2.5 声明）', () => {
    const plan = toRequest(baseShot(), {
      model: 'doubao-seedance-2-5-1', duration: 8, resolution: '720p', aspectRatio: '16:9', referenceMode: true,
      referenceUrls: ['https://a.example/1.png', 'https://a.example/2.png'],
      caps: capsOf('2.5', { durationRange: [4, 30], maxReferenceImages: 30 }),
    })
    expect(plan.referenceRoles).toEqual(['reference_image', 'reference_image'])
  })
  it('3+ 张自动走参考图生视频 role', () => {
    const plan = toRequest(baseShot(), {
      model: 'doubao-seedance-2-5-1', duration: 8, resolution: '720p', aspectRatio: '16:9', referenceMode: false,
      referenceUrls: ['https://a.example/1.png', 'https://a.example/2.png', 'https://a.example/3.png'],
      caps: capsOf('2.5', { durationRange: [4, 30], maxReferenceImages: 30 }),
    })
    expect(plan.referenceRoles).toEqual(['reference_image', 'reference_image', 'reference_image'])
  })
})

describe('计价与状态', () => {
  it('计价未校准：estimatedCost=null、CNY、matchedPricing=false；family 标签透传', () => {
    const est = estimate('doubao-seedance-2-0-1', 5, '720p', '2.0')
    expect(est.family).toBe('2.0')
    expect(est.estimatedCost).toBeNull()
    expect(est.currency).toBe('CNY')
    expect(est.matchedPricing).toBe(false)
    expect(est.pricingNote).toContain('未校准')
  })
  it('官方状态词汇：done=succeeded，失败终态含 failed/expired', () => {
    expect(extraDoneStatuses()).toEqual(['succeeded'])
    expect(extraFailedStatuses()).toContain('failed')
    expect(extraFailedStatuses()).toContain('expired')
    expect(isTerminalStatus('expired')).toBe(true)
    expect(isTerminalStatus('succeeded')).toBe(true)
  })
  it('成片 URL：content.video_url 优先，output/顶层兜底', () => {
    expect(extractVideoUrl({ content: { video_url: 'https://v/1.mp4' } })).toBe('https://v/1.mp4')
    expect(extractVideoUrl({ content: null, output: { video_url: 'https://v/2.mp4' } })).toBe('https://v/2.mp4')
    expect(extractVideoUrl({ video_url: 'https://v/3.mp4' })).toBe('https://v/3.mp4')
    expect(extractVideoUrl(null)).toBeNull()
  })
})


describe('clampPromptReport 溢出报告（不静默牺牲）', () => {
  it('未超限 → overflow=null，prompt 原样', () => {
    const { prompt, overflow } = clampPromptReport('短句甲；短句乙；短句丙')
    expect(prompt).toBe('短句甲；短句乙；短句丙')
    expect(overflow).toBeNull()
  })

  it('超限 → 返回裁剪后 prompt + 溢出明细（含被裁片段）', () => {
    const long = '甲；'.repeat(300) // 600 字
    const { prompt, overflow } = clampPromptReport(long)
    expect(prompt.length).toBeLessThanOrEqual(overflow!.limit + 1)
    expect(overflow!.originalChars).toBe(600)
    expect(overflow!.droppedChars).toBeGreaterThan(0)
    expect(overflow!.droppedTail.length).toBeGreaterThan(0)
  })
})
