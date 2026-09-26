// dsh-video 入口 — dsh 视频创作插件
//
// 模块划分：
// - config/      配置（name / Config schema / inject）
// - workspace/   工作区/故事上下文解析 + video_init 目录骨架
// - doctrine/    官方能力库装载（11 域词汇轴 / 手法卡片 / 组合包，双面 md + YAML front-matter）
// - adapter/     seeddance 转译层（标准 JSON → 厂商 prompt、计价、错误映射、API 客户端）
// - db/          SQLite（story registry + 决策链）
// - agent/       dsh 能力调用（session 事件、上下文注入、工具注册）
//
// 运行形态（与 dsh-mesync 同族）：Cordis bundle，注入面走 systemPrompt.section，
// 工具面走 ctx.tools.register；能力速览表常驻注入（含 dvd 介绍与激活三态，全文件驱动），
// 工作区/故事在场时追加心法总纲 + Story Context 投影。

import type { Context } from '@deepseek-ai/cordis'

import { name, Config, inject } from './config/index.js'
import { registerTools } from './agent/tools.js'
import { registerEvents } from './agent/index.js'

export { name, Config, inject }

// ---- 插件入口 ----

export function apply(ctx: Context, config: Config) {
  registerTools(ctx, config)
  registerEvents(ctx, config)
}