import { describe, it, expect } from 'vitest'
import {
  defaultBaseUrl, familyOf, durationRangeOf,
  buildStandardSentence, buildVendorPrompt, clampPrompt,
  validateReferenceInput, toRequest, estimate, extractVideoUrl,
  extraDoneStatuses, extraFailedStatuses, isTerminalStatus,
  resolveCapabilities, type FamilyCaps,
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

describe('模型家族解析（api.json 契约驱动）', () => {
  it('按 Model ID 前缀解析，fast/mini 先于 2.0 基座', () => {
    expect(familyOf('doubao-seedance-2-5-xxxx')).toBe('2.5')
    expect(familyOf('doubao-seedance-2-0-fast-xxxx')).toBe('2.0fast')
    expect(familyOf('doubao-seedance-2-0-mini-xxxx')).toBe('2.0mini')
    expect(familyOf('doubao-seedance-2-0-xxxx')).toBe('2.0')
    expect(familyOf('doubao-seedance-1-0-pro-fast-xxxx')).toBe('1.0profast')
    expect(familyOf('doubao-seedance-1-0-pro-250528')).toBe('1.0pro')
  })
  it('未登记前缀返回 null（不回退编造家族）', () => {
    expect(familyOf('other-model')).toBeNull()
    expect(familyOf('ep-20260101-abcd')).toBeNull()
  })
  it('日期版本号 ID 按前缀解析家族（新版本 ID 不需插件发版，同规则）', () => {
    expect(familyOf('doubao-seedance-2-5-260628')).toBe('2.5')
    expect(familyOf('doubao-seedance-2-0-260128')).toBe('2.0')
    expect(familyOf('doubao-seedance-2-0-fast-260128')).toBe('2.0fast')
    expect(familyOf('doubao-seedance-2-0-mini-260615')).toBe('2.0mini')
  })
  it('duration 范围按家族取值；未登记家族返回 null', () => {
    expect(durationRangeOf('2.5')).toEqual([4, 30])
    expect(durationRangeOf('2.0fast')).toEqual([4, 15])
    expect(durationRangeOf('1.0pro')).toEqual([2, 12])
    expect(durationRangeOf('generic')).toBeNull()
  })
  it('前缀解析不依赖表内插入顺序（最长前缀优先）', () => {
    // 契约表里 fast/mini 在基座前；但即便顺序颠倒，算法也必须命中更长的前缀
    expect(familyOf('doubao-seedance-2-0-fast-260128')).toBe('2.0fast')
    expect(familyOf('doubao-seedance-2-0-mini-260615')).toBe('2.0mini')
    expect(familyOf('doubao-seedance-2-0-260128')).toBe('2.0')
  })
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

describe('家族能力解析（配置化）', () => {
  const capsOf = (m: string): FamilyCaps => resolveCapabilities(familyOf(m), undefined).caps!

  it('已登记家族走契约预设', () => {
    const r = resolveCapabilities('2.5')
    expect(r.error).toBeNull()
    expect(r.caps!.source).toBe('preset')
    expect(r.caps!.durationRange).toEqual([4, 30])
    expect(r.caps!.maxReferenceImages).toBe(30)
    expect(r.caps!.maxFirstLastFrame).toBe(2)
    expect(r.caps!.generateAudio).toBe('explicit-false')
    const r1 = resolveCapabilities('1.0pro')
    expect(r1.caps!.durationRange).toEqual([2, 12])
    expect(r1.caps!.maxReferenceImages).toBe(0)
    expect(r1.caps!.generateAudio).toBe('omit')
  })

  it('已登记家族可部分覆盖能力（未覆盖字段沿用预设）', () => {
    const r = resolveCapabilities('2.0', { maxReferenceImages: 15 })
    expect(r.error).toBeNull()
    expect(r.caps!.source).toBe('configured')
    expect(r.caps!.maxReferenceImages).toBe(15)
    expect(r.caps!.durationRange).toEqual([4, 15])
    expect(r.caps!.generateAudio).toBe('explicit-false')
  })

  it('未登记家族：无声明 → 拒绝并给配置模板', () => {
    const r = resolveCapabilities('doubao-seedance-3-0-xxx', undefined)
    expect(r.caps).toBeNull()
    expect(r.error).toContain('能力声明')
    const rn = resolveCapabilities(null, undefined)
    expect(rn.caps).toBeNull()
    expect(rn.error).not.toBeNull()
  })

  it('未登记家族：声明缺项 → 报缺项', () => {
    const r = resolveCapabilities('doubao-seedance-3-0-xxx', { durationRange: [4, 15] })
    expect(r.caps).toBeNull()
    expect(r.error).toContain('maxReferenceImages')
  })

  it('未登记家族：四项齐备 → configured 生效', () => {
    const r = resolveCapabilities('doubao-seedance-3-0-xxx', {
      durationRange: [4, 20], maxReferenceImages: 5, maxFirstLastFrame: 2, generateAudio: 'omit',
    })
    expect(r.error).toBeNull()
    expect(r.caps!.family).toBe('doubao-seedance-3-0-xxx')
    expect(r.caps!.source).toBe('configured')
    expect(r.caps!.durationRange).toEqual([4, 20])
    expect(r.caps!.maxReferenceImages).toBe(5)
    expect(r.caps!.generateAudio).toBe('omit')
  })

  it('非法配置显式报错', () => {
    expect(resolveCapabilities('2.0', { durationRange: [30, 4] }).error).toContain('durationRange')
    expect(resolveCapabilities('2.0', { generateAudio: 'audio-on' as never }).error).toContain('generateAudio')
    const rx = resolveCapabilities('x', { durationRange: [4, 15], maxReferenceImages: 9, maxFirstLastFrame: 2, generateAudio: 'bad' as never })
    expect(rx.error).toContain('generateAudio')
  })
})

describe('参考图校验（家族上限，能力来自配置解析）', () => {
  const capsOf = (m: string): FamilyCaps => resolveCapabilities(familyOf(m), undefined).caps!
  const seedance25 = 'doubao-seedance-2-5-1'
  const seedance20fast = 'doubao-seedance-2-0-fast-1'
  const seedance10fast = 'doubao-seedance-1-0-pro-fast-1'
  const seedance10pro = 'doubao-seedance-1-0-pro-1'
  it('无图直通', () => {
    expect(validateReferenceInput(seedance10fast, 0, false, capsOf(seedance10fast))).toBeNull()
  })
  it('1.0 pro fast 仅首帧 1 张', () => {
    expect(validateReferenceInput(seedance10fast, 1, false, capsOf(seedance10fast))).toBeNull()
    expect(validateReferenceInput(seedance10fast, 2, false, capsOf(seedance10fast))).toContain('最多支持 1 张')
  })
  it('1.0 系列不支持参考图（reference_mode）', () => {
    expect(validateReferenceInput(seedance10pro, 2, true, capsOf(seedance10pro))).toContain('不支持参考图')
    expect(validateReferenceInput(seedance10pro, 3, false, capsOf(seedance10pro))).toContain('不支持参考图生视频')
  })
  it('2.0 系列上限 9 张、2.5 上限 30 张', () => {
    expect(validateReferenceInput(seedance20fast, 9, true, capsOf(seedance20fast))).toBeNull()
    expect(validateReferenceInput(seedance20fast, 10, true, capsOf(seedance20fast))).toContain('上限 9 张')
    expect(validateReferenceInput(seedance25, 30, true, capsOf(seedance25))).toBeNull()
    expect(validateReferenceInput(seedance25, 31, true, capsOf(seedance25))).toContain('上限 30 张')
  })
  it('1.0 pro 支持首尾帧 2 张', () => {
    expect(validateReferenceInput(seedance10pro, 2, false, capsOf(seedance10pro))).toBeNull()
  })
  it('用户 caps 覆盖：2.0fast 参考图上限改为 3', () => {
    const custom = resolveCapabilities('2.0fast', { maxReferenceImages: 3 }).caps!
    expect(validateReferenceInput(seedance20fast, 3, true, custom)).toBeNull()
    expect(validateReferenceInput(seedance20fast, 4, true, custom)).toContain('上限 3 张')
  })
})

describe('请求体映射（火山方舟形态）', () => {
  const capsOf = (m: string): FamilyCaps => resolveCapabilities(familyOf(m), undefined).caps!
  it('content 首条为 text，时长按家族 clamp，watermark=false', () => {
    const plan = toRequest(baseShot(), {
      model: 'doubao-seedance-2-0-1', duration: 3, resolution: '720p', aspectRatio: '16:9', referenceMode: false, referenceUrls: [],
      caps: capsOf('doubao-seedance-2-0-1'),
    })
    expect(plan.family).toBe('2.0')
    expect(plan.duration).toBe(4) // 3s 低于 2.0 家族下限
    expect(plan.body.content[0]).toEqual({ type: 'text', text: plan.vendorPrompt })
    expect(plan.body.watermark).toBe(false)
    expect(plan.body.generate_audio).toBe(false)
    expect(plan.body.resolution).toBe('720p')
    expect(plan.body.ratio).toBe('16:9')
  })
  it('1.0 系列不携带 generate_audio；duration 上限 clamp 12', () => {
    const plan = toRequest(baseShot(), {
      model: 'doubao-seedance-1-0-pro-250528', duration: 30, resolution: '1080p', aspectRatio: '16:9', referenceMode: false, referenceUrls: [],
      caps: capsOf('doubao-seedance-1-0-pro-250528'),
    })
    expect(plan.family).toBe('1.0pro')
    expect(plan.duration).toBe(12)
    expect(plan.body).not.toHaveProperty('generate_audio')
  })
  it('两张图分配 first_frame/last_frame', () => {
    const plan = toRequest(baseShot(), {
      model: 'doubao-seedance-2-0-1', duration: 5, resolution: '720p', aspectRatio: '16:9', referenceMode: false,
      referenceUrls: ['https://a.example/1.png', 'https://a.example/2.png'],
      caps: capsOf('doubao-seedance-2-0-1'),
    })
    const imgs = plan.body.content.slice(1)
    expect(imgs.map(i => i.image_url!.role)).toEqual(['first_frame', 'last_frame'])
  })
  it('reference_mode 全图 reference_image（2.5 家族）', () => {
    const plan = toRequest(baseShot(), {
      model: 'doubao-seedance-2-5-1', duration: 8, resolution: '720p', aspectRatio: '16:9', referenceMode: true,
      referenceUrls: ['https://a.example/1.png', 'https://a.example/2.png'],
      caps: capsOf('doubao-seedance-2-5-1'),
    })
    expect(plan.referenceRoles).toEqual(['reference_image', 'reference_image'])
  })
  it('3+ 张自动走参考图生视频 role', () => {
    const plan = toRequest(baseShot(), {
      model: 'doubao-seedance-2-5-1', duration: 8, resolution: '720p', aspectRatio: '16:9', referenceMode: false,
      referenceUrls: ['https://a.example/1.png', 'https://a.example/2.png', 'https://a.example/3.png'],
      caps: capsOf('doubao-seedance-2-5-1'),
    })
    expect(plan.referenceRoles).toEqual(['reference_image', 'reference_image', 'reference_image'])
  })
})

describe('计价与状态', () => {
  it('计价未校准：estimatedCost=null、CNY、matchedPricing=false', () => {
    const est = estimate('doubao-seedance-2-0-1', 5, '720p')
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