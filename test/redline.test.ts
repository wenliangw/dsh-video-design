// test/redline.test.ts —— 红线守护：源码里不允许出现任何 URL 或模型版本串
//
// 用户指令的直接机器化：插件零内置模型事实、零内置 URL 事实；
// 模型/地址只能来自用户配置。此测试扫描 src/ 全部源码，出现即红。

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')

function readAllTs(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...readAllTs(p))
    else if (entry.name.endsWith('.ts')) out.push(fs.readFileSync(p, 'utf-8'))
  }
  return out
}

describe('红线：零内置模型/URL 事实（用户指令机器化）', () => {
  const sources = readAllTs(SRC)
  const all = sources.join('\n')

  it('源码没有任何 https:// 地址（完整地址必须由用户配置提供）', () => {
    expect(all).not.toMatch(/https:\/\//)
  })

  it('源码没有任何模型版本 ID 串（seedance-N / doubao 模型名等）', () => {
    expect(all).not.toMatch(/seedance-[0-9]/i)
    expect(all).not.toMatch(/doubao/i)
  })

  it('源码没有任何内置 env 默认模型值（模型只读用户环境变量/配置，不写默认）', () => {
    // SEEDANCE_MODEL 只能作为「读环境变量」出现，不能作为「赋值默认模型 ID」
    const assignments = sources.flatMap(s =>
      [...s.matchAll(/SEEDANCE_MODEL\s*=\s*["'\u201c]/g)].map(m => m[0]))
    expect(assignments).toEqual([])
  })
})