// dsh-video-design v2 入口 —— 分步验证最小核（实验台）
//
// 设计原则（与 v1 决裂）：
// - 只有「已证实」的能力才配住在插件里。v1 的 11 域/卡片/编译环/确认卡/上游链/记忆五块
//   全部是未经成片验证的假设，已随 master 分支归档（见 git 历史）。
// - v2 唯一事实：写一段纯文本提示词 → 提交用户配置的模型 → 轮询 → 取片 → 记一条实验记录。
//   插件零内置模型事实、零内置 URL 事实：模型、API Key、完整请求地址 100% 由用户配置。
// - 每一步新能力上线前，必须先被一次真实成片实验证明（H0 能力摸底 → H1 句式效应 → …）。

import type { Context } from '@deepseek-ai/cordis'
import { registerTools } from './agent/tools.js'
import { registerPromptSkill } from './agent/skills.js'

export const name = 'dsh-video-design'
export const inject = ['tools', 'skills']

export function apply(ctx: Context) {
  registerTools(ctx)
  registerPromptSkill(ctx) // 插件自带能力：给 agent 的提示词编写心法（skill 目录可见）
}