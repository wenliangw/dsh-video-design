import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import {
  defaultBaseUrl, familyOf, durationRangeOf,
  buildStandardSentence, buildVendorPrompt, clampPrompt,
  validateReferenceInput, toRequest, estimate, extractVideoUrl,
  extraDoneStatuses, extraFailedStatuses, isTerminalStatus,
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
  it('未知前缀回退 generic 家族', () => {
    expect(familyOf('other-model')).toBe('generic')
  })
  it('当前在售版本 ID（api.json currentIdsByFamily）家族解析正确', () => {
    const apiJson = JSON.parse(fs.readFileSync(new URL('../src/adapters/seedance/api.json', import.meta.url), 'utf-8'))
    const current: Record<string, string> = apiJson.models.currentIdsByFamily
    expect(Object.keys(current).length).toBeGreaterThanOrEqual(4)
    for (const [family, id] of Object.entries(current)) {
      expect(familyOf(id), `${id} 应解析为 ${family}`).toBe(family)
    }
  })
  it('duration 范围按家族取值', () => {
    expect(durationRangeOf('2.5')).toEqual([4, 30])
    expect(durationRangeOf('2.0fast')).toEqual([4, 15])
    expect(durationRangeOf('1.0pro')).toEqual([2, 12])
    expect(durationRangeOf('generic')).toEqual([2, 30])
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

describe('参考图校验（家族上限）', () => {
  const seedance25 = 'doubao-seedance-2-5-1'
  const seedance20fast = 'doubao-seedance-2-0-fast-1'
  const seedance10fast = 'doubao-seedance-1-0-pro-fast-1'
  const seedance10pro = 'doubao-seedance-1-0-pro-1'
  it('无图直通', () => {
    expect(validateReferenceInput(seedance10fast, 0, false)).toBeNull()
  })
  it('1.0 pro fast 仅首帧 1 张', () => {
    expect(validateReferenceInput(seedance10fast, 1, false)).toBeNull()
    expect(validateReferenceInput(seedance10fast, 2, false)).toContain('最多支持 1 张')
  })
  it('1.0 系列不支持参考图（reference_mode）', () => {
    expect(validateReferenceInput(seedance10pro, 2, true)).toContain('不支持参考图')
    expect(validateReferenceInput(seedance10pro, 3, false)).toContain('不支持参考图生视频')
  })
  it('2.0 系列上限 9 张、2.5 上限 30 张', () => {
    expect(validateReferenceInput(seedance20fast, 9, true)).toBeNull()
    expect(validateReferenceInput(seedance20fast, 10, true)).toContain('上限 9 张')
    expect(validateReferenceInput(seedance25, 30, true)).toBeNull()
    expect(validateReferenceInput(seedance25, 31, true)).toContain('上限 30 张')
  })
  it('1.0 pro 支持首尾帧 2 张', () => {
    expect(validateReferenceInput(seedance10pro, 2, false)).toBeNull()
  })
})

describe('请求体映射（火山方舟形态）', () => {
  it('content 首条为 text，时长按家族 clamp，watermark=false', () => {
    const plan = toRequest(baseShot(), {
      model: 'doubao-seedance-2-0-1', duration: 3, resolution: '720p', aspectRatio: '16:9', referenceMode: false, referenceUrls: [],
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
    })
    expect(plan.family).toBe('1.0pro')
    expect(plan.duration).toBe(12)
    expect(plan.body).not.toHaveProperty('generate_audio')
  })
  it('两张图分配 first_frame/last_frame', () => {
    const plan = toRequest(baseShot(), {
      model: 'doubao-seedance-2-0-1', duration: 5, resolution: '720p', aspectRatio: '16:9', referenceMode: false,
      referenceUrls: ['https://a.example/1.png', 'https://a.example/2.png'],
    })
    const imgs = plan.body.content.slice(1)
    expect(imgs.map(i => i.image_url!.role)).toEqual(['first_frame', 'last_frame'])
  })
  it('reference_mode 全图 reference_image（2.5 家族）', () => {
    const plan = toRequest(baseShot(), {
      model: 'doubao-seedance-2-5-1', duration: 8, resolution: '720p', aspectRatio: '16:9', referenceMode: true,
      referenceUrls: ['https://a.example/1.png', 'https://a.example/2.png'],
    })
    expect(plan.referenceRoles).toEqual(['reference_image', 'reference_image'])
  })
  it('3+ 张自动走参考图生视频 role', () => {
    const plan = toRequest(baseShot(), {
      model: 'doubao-seedance-2-5-1', duration: 8, resolution: '720p', aspectRatio: '16:9', referenceMode: false,
      referenceUrls: ['https://a.example/1.png', 'https://a.example/2.png', 'https://a.example/3.png'],
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