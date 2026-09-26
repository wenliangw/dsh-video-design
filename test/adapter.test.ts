// test/adapter.test.ts — 两层转译 + 计价 + 三份记录
import { describe, it, expect } from 'vitest'
import {
  buildStandardSentence, buildVendorPrompt, toRequest, estimate, clampPrompt,
  readShotRecord, writeShotRecord, extractVideoUrl,
  type ShotJSON,
} from '../src/adapter/seeddance.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const shot: ShotJSON = {
  shot: {
    index: 'S001',
    episode: 'EP001',
    subject: '主角缓步走向镜头',
    windows: [{ from: '0s', to: '3s', movement: '远景固定' }],
    axes: {
      size: 'FS',
      angle: 'low',
      movement: 'dolly-in',
      composition: 'center',
      lighting: 'rim-light',
      color: 'cold',
      pacing: 'tense',
      sound: 'tense-strings',
      vfx: 'none',
    },
    cards: ['low-angle-hero'],
  },
  constraints: { avoid: ['多人物+大范围运动'], negatives: ['畸形手指'] },
}

describe('提示词两层标准化', () => {
  it('标准层固定子句顺序，含时间窗', () => {
    const s = buildStandardSentence(shot)
    expect(s).toContain('[0s-3s]')
    expect(s).toContain('主角缓步走向镜头')
    expect(s).toContain('镜头[size]FS')
    expect(s.indexOf('[0s-3s]')).toBeLessThan(s.indexOf('镜头[size]'))
  })

  it('厂商层是单一字符串（无分段语法），多窗走叙述流', () => {
    const multi: ShotJSON = {
      shot: {
        ...shot.shot,
        windows: [
          { from: '0s', to: '3s', movement: '快速推近' },
          { from: '3s', to: '5s', movement: '环绕揭示' },
        ],
      },
    }
    const p = buildVendorPrompt(multi)
    expect(p).toContain('前 3 秒')
    expect(p).toContain('随后')
    expect(p).not.toContain('[')
  })

  it('参考图模式附加照片质感提示', () => {
    const p = buildVendorPrompt(shot, { photographic: true })
    expect(p).toContain('真实摄影质感')
    const plain = buildVendorPrompt(shot)
    expect(plain).not.toContain('真实摄影质感')
  })
})

describe('参数映射与计价', () => {
  it('toRequest 映射默认参数 + reference_mode（仅 2.0/2.5 且 1–2 图）', () => {
    const req = toRequest(shot, {
      model: 'seedance-2.5', duration: 5, quality: '720p', aspectRatio: '16:9',
      referenceMode: true, contentFilter: true,
      referenceUrls: ['https://cdn.example.com/a.png'],
    })
    expect(req.model).toBe('seedance-2.5')
    expect(req.duration).toBe(5)
    expect(req.reference_mode).toBe(true)
    expect(req.image_urls).toEqual(['https://cdn.example.com/a.png'])
    expect(req.content_filter).toBeUndefined()  // content_filter 默认 true，官方契约下不显式携带
  })

  it('content_filter=false 显式携带；reference_mode 条件：3+ 图/非 2.0/2.5 模型不携带', () => {
    const off = toRequest(shot, {
      model: 'seedance-2.5', duration: 5, quality: '720p', aspectRatio: '16:9',
      referenceMode: true, contentFilter: false, referenceUrls: [],
    })
    expect(off.content_filter).toBe(false)
    const three = toRequest(shot, {
      model: 'seedance-2.5', duration: 5, quality: '720p', aspectRatio: '16:9',
      referenceMode: true, contentFilter: true,
      referenceUrls: ['https://a.com/1.png', 'https://a.com/2.png', 'https://a.com/3.png'],
    })
    expect(three.reference_mode).toBeUndefined()  // 3+ 张走参考生视频，非 reference_mode
    expect(three.image_urls?.length).toBe(3)
    const wrongModel = toRequest(shot, {
      model: 'seedance-2.0-fast', duration: 5, quality: '720p', aspectRatio: '16:9',
      referenceMode: true, contentFilter: true,
      referenceUrls: ['https://cdn.example.com/a.png'].slice(0, 1),
    })
    // 官方：reference_mode 是 2.0/2.5 专属
    expect(wrongModel.reference_mode).toBeUndefined()
  })

  it('估算：未知型号按 fast 兜底并带 matchedModel=false 提示', () => {
    const known = estimate('seedance-2.5', 5, '1080p')
    expect(known.matchedModel).toBe(true)
    const unknown = estimate('future-model-x', 5, '1080p')
    expect(unknown.matchedModel).toBe(false)
    expect(unknown.estimatedCredits).toBe(estimate('seedance-2.0-fast', 5, '1080p').estimatedCredits)
  })

  it('extractVideoUrl：官方层级 output.video_url 优先，顶层兜底', () => {
    expect(extractVideoUrl({ status: 'done', output: { video_url: 'https://v.example/a.mp4' } })).toBe('https://v.example/a.mp4')
    expect(extractVideoUrl({ status: 'processing', output: null })).toBe(null)
    expect(extractVideoUrl({ status: 'processing', output: undefined, video_url: 'https://v.example/legacy.mp4' })).toBe('https://v.example/legacy.mp4')
  })

  it('clampPrompt 超长按子句边界砍尾部（主体保留）', () => {
    const head = '主角缓步走向镜头'
    const extras = '；气势氛围' + '长'.repeat(200)
    const p = clampPrompt(`${head}${extras}；风格辅助`)
    expect(p.length).toBeLessThanOrEqual(1501)
    expect(p.startsWith(head)).toBe(true)
  })

  it('negatives 约束进入厂商层 prompt', () => {
    const s: ShotJSON = {
      shot: { ...shot.shot },
      constraints: { negatives: ['畸形手指', '多指'] },
    }
    const p = buildVendorPrompt(s)
    expect(p).toContain('避免')
    expect(p).toContain('畸形手指')
  })

  it('计价跟随模型×时长×画质，含模式因子', () => {
    const base = estimate('seedance-2.0-fast', 5, '720p')
    const refMode = estimate('seedance-2.0-fast', 5, '720p', 1.1)
    expect(refMode.estimatedCredits).toBeGreaterThan(base.estimatedCredits)
    const hi = estimate('seedance-2.5', 5, '1080p')
    expect(hi.estimatedCredits).toBeGreaterThan(base.estimatedCredits)
  })

  it('2.0-mini 无 1080p 档：按 720p 档计价（绝不出现 0 积分误导）', () => {
    const c = estimate('seedance-2.0-mini', 5, '1080p')
    expect(c.estimatedCredits).toBeGreaterThan(0)
    expect(c.estimatedCredits).toBe(estimate('seedance-2.0-mini', 5, '720p').estimatedCredits)
  })
})

describe('shot 三份记录落盘', () => {
  it('写读往返一致', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-video-'))
    const file = path.join(dir, 'S001.json')
    const record = {
      shot,
      vendor_prompt: 'test prompt',
      meta: {
        adapter: 'seeddance',
        schema_ver: '1.0',
        model: 'seedance-2.0-fast',
        duration: 5,
        quality: '720p',
        status: 'pending' as const,
        task_id: 'vid_test',
        attempts: [{ at: new Date().toISOString(), task_id: 'vid_test', vendor_prompt: 'test prompt' }],
      },
    }
    writeShotRecord(file, record)
    const back = readShotRecord(file)
    expect(back?.meta.task_id).toBe('vid_test')
    expect(back?.shot.shot.axes.angle).toBe('low')
    expect(back?.vendor_prompt).toBe('test prompt')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})