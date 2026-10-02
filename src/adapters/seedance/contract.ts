// adapters/seedance/contract.ts —— 运行语义词汇（响应侧事实）
//
// 这里只有 v1 六个真实任务验证过的「响应语义」：任务状态词、HTTP 错误语义。
// 没有任何 URL、没有任何模型 ID、没有任何按模型区分的能力表——那些事实全部由用户配置提供。
// 红线（有测试钉住，见 test/redline.test.ts）：本插件源码里不允许出现任何完整网址（协议+域名）
// 或任何模型版本串。

/** 官方任务状态词（查询 API 响应）；插件本地另用 pending 标记「已提交、尚未查询过」 */
export const TASK_STATUS = {
  queued: 'queued',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  expired: 'expired',
  pending: 'pending', // 插件本地词汇（非官方）：创建后、首次查询前
} as const

/** 终态：不再变化，可停止轮询 */
export const TERMINAL_STATUSES: readonly string[] = [TASK_STATUS.succeeded, TASK_STATUS.failed, TASK_STATUS.expired]

/** 成功态：拿到成片的条件 */
export const DONE_STATUSES: readonly string[] = [TASK_STATUS.succeeded]

/** HTTP 语义（错误提示用，不含任何厂商地址） */
export const HTTP_SEMANTICS: Record<string, string> = {
  '400': '请求参数或媒体素材不符合要求',
  '401': '鉴权失败——检查 API Key',
  '403': '无权限',
  '429': '触发限流，稍后重试',
  '500': '服务端错误，稍后重试',
  '502': '网关错误，稍后重试',
  '503': '服务不可用，稍后重试',
}