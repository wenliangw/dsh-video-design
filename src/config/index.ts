// config/index — dsh-video 配置定义
// 插件名、Config schema、依赖注入声明

import Schema from '@deepseek-ai/schemastery'

/** 插件名（dsh 插件标识，cordis.patch.yml 里 id: video） */
export const name = 'video'

/** dsh-video 配置项 */
export interface Config {
  /** seeddance 默认模型 */
  seedanceModel: string
  /** 默认出片时长（秒，2–30） */
  defaultDuration: number
  /** 默认画质 */
  defaultQuality: '480p' | '720p' | '1080p'
  /** 默认画幅 */
  defaultAspectRatio: string
  /** 预算硬闸（积分，0 = 不限，查余额仅提示） */
  budgetCredits: number
  /** 是否默认用 reference_mode 喂 SVG 参考图（2.0/2.5） */
  referenceMode: boolean
  /** story 投影最多带几条决策 */
  maxRecallDecisions: number
}

/** Config 的 Schemastery schema（dsh 用于校验 + 填默认值） */
export const Config: Schema<Config> = Schema.object({
  seedanceModel: Schema.string().default('seedance-2.0-fast'),
  defaultDuration: Schema.number().default(5),
  defaultQuality: Schema.union(['480p', '720p', '1080p']).default('720p'),
  defaultAspectRatio: Schema.string().default('16:9'),
  budgetCredits: Schema.number().default(0),
  referenceMode: Schema.boolean().default(true),
  maxRecallDecisions: Schema.number().default(5),
})

/** 插件依赖的服务（dsh 会等待这些服务就绪后再加载插件） */
export const inject = ['tools', 'systemPrompt']