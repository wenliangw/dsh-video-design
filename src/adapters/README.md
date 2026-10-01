# adapters — 多厂商适配器契约与实现

一个厂商一个子目录：**契约文件（overview.md + api.json）与实现代码同住一个目录**，官方文档更新只改子目录内文件、不动上层代码。

```
src/adapters/
├── README.md            ← 本文件：目录契约与维护流程
├── registry.ts          ← 适配器注册/解析（name → 配置与凭证，多厂商共享）
└── seedance/            ← 火山方舟 Doubao-Seedance
    ├── overview.md      ← 人类可读的官方契约实录（来源 URL + 核对日期 + 参数表 + 待补录清单）
    ├── api.json         ← 机器面契约（endpoints/paths/模型家族/入参上限/状态词/错误语义）
    └── seedance.ts      ← 实现：运行时只读同目录 api.json，不在代码里写死厂商事实
```

## 为什么分两层

- **overview.md 给人看**：官方文档转写 + 来源链接 + 核对日期——过期一眼可见；参数表与「待补录」清单现挂透明。
- **api.json 给代码看**：实现（seedance.ts）运行时读取地址/路径/枚举/上限/状态词/错误语义，**任何厂商事实写死在代码里都是缺陷**，测试钉死「代码行为 = api.json 事实」。

## api.json 只装「是什么」，不装「怎么做」

| 装（是什么） | 不装（怎么做） |
|---|---|
| endpoints：baseUrl 默认值、paths 路径模板 | 两层提示词转译句法（标准层/厂商层） |
| models：家族前缀表、duration 范围、图参考上限 | 请求体组装、幂等锁、预算闸逻辑 |
| request：枚举、上限、默认值（如 watermark=false） | 插件级政策（如 generate_audio 恒 false 的无声承诺 = policy 在代码，事实在契约） |
| task：状态词汇表、终态集合、成片 URL 路径 | 轮询/下载、失败归因落库 |
| errors：HTTP 语义 + 已知业务码中文映射 | 重试策略 |

## 维护流程（官方文档更新时）

1. 拿到官方文档原文（用户提供或人工抓取），更新 `overview.md` 内容 + 顶部来源 URL / 核对日期；
2. 同步更新 `api.json` 的对应机器面字段（**两层必须一起改**，overview 是 api.json 的人类可读依据）；
3. 跑 `npx vitest run test/adapter.test.ts`——测试钉「代码行为 = api.json 事实」，契约改了测试必须跟着翻新；
4. 若新增请求字段尚未接入插件语义，先在 overview.md「待补录」登记，**不伪造支持**。

## 新增厂商

复制 `seedance/` 目录为 `<vendor>/`，改 overview.md/api.json/实现三件套，再在 `registry.ts` 的 `SUPPORTED_ADAPTERS` 登记 name、补 `.dvd.config.json` 模板条目。未实现的 adapter 诚实报错，不静默。