// test/workspace.test.ts — 目录契约：工作区骨架 / 故事骨架 / 上下文解析
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  resolveContext, ensureWorkspaceSkeleton, ensureStorySkeleton, copyTemplates, seedFileIfAbsent,
  loadWorkspaceConfig,
} from '../src/workspace/index.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-video-ws-'))
}

describe('workspace 目录契约', () => {
  it('resovleContext：故事目录向上找到 .story 与 .dvd', () => {
    const ws = tmpDir()
    ensureWorkspaceSkeleton(ws)
    const story = path.join(ws, 'story-林小满')
    ensureStorySkeleton(story, 'story-林小满')
    const fromShots = path.join(story, 'EP001', 'shots')
    fs.mkdirSync(fromShots, { recursive: true })
    const ctx = resolveContext(fromShots)
    expect(ctx.workspaceRoot).toBe(ws)
    expect(ctx.storyRoot).toBe(story)
    fs.rmSync(ws, { recursive: true, force: true })
  })

  it('骨架幂等：二次 ensure 不覆盖已有文件', () => {
    const ws = tmpDir()
    ensureWorkspaceSkeleton(ws)
    const cfg = path.join(ws, '.dvd', 'config.json')
    const before = fs.readFileSync(cfg, 'utf-8')
    fs.writeFileSync(cfg, '{"adapter":"seeddance"}\n')
    ensureWorkspaceSkeleton(ws)
    expect(fs.readFileSync(cfg, 'utf-8')).toBe('{"adapter":"seeddance"}\n')
    expect(before).toContain('budgetCredits')
    fs.rmSync(ws, { recursive: true, force: true })
  })

  it('生成 .dvd.config.json（工作区根、多 adapter 模板、幂等不覆盖）', () => {
    const ws = tmpDir()
    ensureWorkspaceSkeleton(ws)
    const p = path.join(ws, '.dvd.config.json')
    expect(fs.existsSync(p)).toBe(true)
    const tpl = JSON.parse(fs.readFileSync(p, 'utf-8'))
    expect(tpl.adapters[0].name).toBe('seedance')
    const mine = '{"adapters":[{"name":"seedance","apiKey":"sk-mine"}]}'
    fs.writeFileSync(p, mine)
    ensureWorkspaceSkeleton(ws)
    expect(fs.readFileSync(p, 'utf-8').trim()).toBe(mine)
    fs.rmSync(ws, { recursive: true, force: true })
  })

  it('凭证防泄露：首次创建默认把 .dvd.config.json 写进工作区根 .gitignore', () => {
    const ws = tmpDir()
    fs.writeFileSync(path.join(ws, '.gitignore'), 'node_modules/\n')
    ensureWorkspaceSkeleton(ws)
    const gi = fs.readFileSync(path.join(ws, '.gitignore'), 'utf-8')
    expect(gi).toContain('.dvd.config.json')
    expect(gi).toContain('node_modules/') // 不动已有内容
    // 再次 ensure：不重复追加
    const once = gi.split('\n').filter(l => l.trim() === '.dvd.config.json').length
    ensureWorkspaceSkeleton(ws)
    const gi2 = fs.readFileSync(path.join(ws, '.gitignore'), 'utf-8')
    const twice = gi2.split('\n').filter(l => l.trim() === '.dvd.config.json').length
    expect(once).toBe(1)
    expect(twice).toBe(1)
    fs.rmSync(ws, { recursive: true, force: true })
  })

  it('用户自行移出 ignore = 明确要提交：后续 ensure 不再加回', () => {
    const ws = tmpDir()
    ensureWorkspaceSkeleton(ws)
    // 用户删掉该行
    const gi = path.join(ws, '.gitignore')
    const content = fs.readFileSync(gi, 'utf-8').split(/\r?\n/).filter(l => !l.includes('.dvd.config.json')).join('\n')
    fs.writeFileSync(gi, content)
    ensureWorkspaceSkeleton(ws)
    expect(fs.readFileSync(gi, 'utf-8')).not.toContain('.dvd.config.json')
    fs.rmSync(ws, { recursive: true, force: true })
  })

  it('故事骨架：.story 记忆层与 EP001 资产同级，AGENTS.md 总纲落盘（decisions 落 db 不落 .story）', () => {
    const ws = tmpDir()
    const story = path.join(ws, 'story-test')
    const { created, storyName } = ensureStorySkeleton(story, 'story-test', '# 心法总纲测试')
    expect(created).toBe(true)
    expect(storyName).toBe('story-test')
    expect(fs.existsSync(path.join(story, '.story', 'overview.md'))).toBe(true)
    expect(fs.existsSync(path.join(story, '.story', 'tastes', 'overview.md'))).toBe(true)
    for (const sub of ['wiki', 'material', 'corrections']) {
      expect(fs.existsSync(path.join(story, '.story', sub))).toBe(true)
    }
    // decisions 全量在 .dvd/db，不在 .story 落目录（避免死目录误导）
    expect(fs.existsSync(path.join(story, '.story', 'decisions'))).toBe(false)
    expect(fs.existsSync(path.join(story, 'EP001', 'shots'))).toBe(true)
    expect(fs.readFileSync(path.join(story, 'AGENTS.md'), 'utf-8')).toContain('心法总纲测试')
    const again = ensureStorySkeleton(story, 'story-test', '# 新版总纲')
    expect(again.created).toBe(false)
    expect(fs.readFileSync(path.join(story, 'AGENTS.md'), 'utf-8')).toContain('心法总纲测试')
    fs.rmSync(ws, { recursive: true, force: true })
  })

  it('loadWorkspaceConfig：读 .dvd/config.json，缺失/损坏/非法返回 {}', () => {
    const ws = tmpDir()
    expect(loadWorkspaceConfig(ws)).toEqual({})
    const cfg = path.join(ws, '.dvd', 'config.json')
    fs.mkdirSync(path.dirname(cfg), { recursive: true })
    fs.writeFileSync(cfg, JSON.stringify({ adapter: 'seedance', budgetCredits: 100, defaultDuration: 8, defaultQuality: '1080p', defaultAspectRatio: '21:9' }))
    expect(loadWorkspaceConfig(ws)).toEqual({ adapter: 'seedance', budgetCredits: 100, defaultDuration: 8, defaultQuality: '1080p', defaultAspectRatio: '21:9' })
    fs.writeFileSync(cfg, 'not-json{')
    expect(loadWorkspaceConfig(ws)).toEqual({})
    fs.rmSync(ws, { recursive: true, force: true })
  })

  it('copyTemplates 清理改名遗留旧文件（仅删与航运一致的，保护用户编辑过的旧名文件）', () => {
    const ws = tmpDir()
    const src = path.join(ws, 'src'), dst = path.join(ws, 'dst')
    fs.mkdirSync(src, { recursive: true })
    fs.writeFileSync(path.join(src, '_correction.skill.md'), '航运新内容')
    fs.writeFileSync(path.join(src, '_workspace.rule.md'), '航运新内容')
    fs.mkdirSync(dst, { recursive: true })
    fs.writeFileSync(path.join(dst, 'correction.skill.md'), '航运新内容')
    fs.writeFileSync(path.join(dst, 'workspace.rule.md'), '用户改过的内容')
    copyTemplates(src, dst, { 'correction.skill.md': '_correction.skill.md', 'workspace.rule.md': '_workspace.rule.md' })
    expect(fs.existsSync(path.join(dst, '_correction.skill.md'))).toBe(true)
    expect(fs.existsSync(path.join(dst, 'correction.skill.md'))).toBe(false)
    expect(fs.readFileSync(path.join(dst, 'workspace.rule.md'), 'utf-8')).toBe('用户改过的内容')
    fs.rmSync(ws, { recursive: true, force: true })
  })

  it('copyTemplates 幂等拷贝不覆盖', () => {
    const ws = tmpDir()
    const src = path.join(ws, 'src'), dst = path.join(ws, 'dst')
    fs.mkdirSync(path.join(src, 'sub'), { recursive: true })
    fs.writeFileSync(path.join(src, 'sub', 'a.md'), 'A')
    expect(copyTemplates(src, dst)).toBe(1)
    fs.writeFileSync(path.join(dst, 'sub', 'a.md'), 'USER EDIT')
    expect(copyTemplates(src, dst)).toBe(0)
    expect(fs.readFileSync(path.join(dst, 'sub', 'a.md'), 'utf-8')).toBe('USER EDIT')
    fs.rmSync(ws, { recursive: true, force: true })
  })

  it('seedFileIfAbsent：幂等播种，用户编辑不被覆盖', () => {
    const ws = tmpDir()
    const p = path.join(ws, '.dvd', 'capabilities.md')
    expect(seedFileIfAbsent(p, '# 母版')).toBe(true)
    fs.writeFileSync(p, '# 用户版')
    expect(seedFileIfAbsent(p, '# 母版v2')).toBe(false)
    expect(fs.readFileSync(p, 'utf-8')).toBe('# 用户版')
    fs.rmSync(ws, { recursive: true, force: true })
  })
})