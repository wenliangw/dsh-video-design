// config/index — dsh-video 配置定义
// 插件名、Config schema、依赖注入声明

import Schema from '@deepseek-ai/schemastery'

/** 插件名（dsh 插件标识，cordis.patch.yml 里 id: video） */
export const name = 'video'

/** dsh-video 配置项 */
export interface Config {
  /** 默认出片时长（秒，2–30） */
  defaultDuration: number
  /** 默认画质 */
  defaultQuality: '480p' | '720p' | '1080p'
  /** 默认画幅 */
  defaultAspectRatio: string
  /** 厂商层提示词裁剪上限（字）。官方参数表建议中文 ≤500 / 英文 ≤1000——是建议值、非硬性限制（超长不被拒，但易信息分散、成片缺元素）。
   *  插件默认按 500 兜底裁剪；0 = 不裁剪，超长原样提交。 */
  promptMaxCharsZh: number
  /** 预算硬闸（元；费率未校准时闸门放行并明示，0 = 不限） */
  budgetCredits: number
  /** 是否默认把参考图按 reference_image role 走参考生视频（仅 2.5/2.0 系列支持） */
  referenceMode: boolean
  /** story 投影最多带几条决策 */
  maxRecallDecisions: number
}

/** Config 的 Schemastery schema（dsh 用于校验 + 填默认值）。
 * 注意：没有 seedanceModel——模型版本更迭是厂商节奏，插件不内置默认模型，
 * 由用户在 .dvd.config.json 的 adapters[].model（或 SEEDANCE_MODEL 环境变量）显式设置。 */
export const Config: Schema<Config> = Schema.object({
  defaultDuration: Schema.number().default(5),
  defaultQuality: Schema.union(['480p', '720p', '1080p']).default('720p'),
  defaultAspectRatio: Schema.string().default('16:9'),
  promptMaxCharsZh: Schema.number().default(500),
  budgetCredits: Schema.number().default(0),
  referenceMode: Schema.boolean().default(true),
  maxRecallDecisions: Schema.number().default(5),
})

/** 插件依赖的服务（dsh 会等待这些服务就绪后再加载插件） */
export const inject = ['tools', 'systemPrompt']