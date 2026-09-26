// db/index — SQLite 数据层（工作区级单库，.dvd/db/video.db）
// 表：story_registry（故事注册）+ decisions（决策链，与 mesync 同构决策模型）。
// wiki/tastes/material/corrections 内容落文件（.story/ 下 md），db 只存索引与决策链。

import Database from 'better-sqlite3'
import * as fs from 'node:fs'
import * as path from 'node:path'

export interface StoryRow {
  id: string
  path: string
  name: string
  created_at: string
}

export interface DecisionNode {
  id: string
  created_at: string
  session_id: string | null
  decision: string
  trigger: string | null
  rationale: string
  evidence: string | null
  outcome: 'adopted' | 'reverted' | 'refined' | 'pending' | null
  caused_by: string | null
  supersedes: string | null
  alternatives: Array<{ option: string; why_not?: string }>
  taste_signals: Array<{ signal: string; context?: string }>
  scopes: string[]
}

let db: Database.Database | null = null

/** 初始化工作区库（幂等；跨 session 复用同一连接，应用退出时 close） */
export function initDB(workspaceRoot: string): Database.Database {
  const dbPath = path.join(workspaceRoot, '.dvd', 'db', 'video.db')
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  if (db) {
    if (db.name === dbPath) return db
    db.close()
  }
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS story_registry (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      session_id TEXT,
      decision TEXT NOT NULL,
      trigger TEXT,
      rationale TEXT NOT NULL,
      evidence TEXT,
      outcome TEXT DEFAULT 'adopted',
      caused_by TEXT,
      supersedes TEXT,
      alternatives TEXT DEFAULT '[]',
      taste_signals TEXT DEFAULT '[]',
      scopes TEXT DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_decisions_created ON decisions(created_at DESC);
  `)
  return db
}

export function closeDB(): void {
  db?.close()
  db = null
}

function mustDB(): Database.Database {
  if (!db) throw new Error('dv: db 未初始化（需要已激活的视频工作区）')
  return db
}

// ---- story registry ----

export function registerStory(storyRoot: string, name: string): StoryRow {
  const d = mustDB()
  const row: StoryRow = {
    id: crypto.randomUUID(),
    path: path.resolve(storyRoot),
    name,
    created_at: new Date().toISOString(),
  }
  // INSERT OR IGNORE：并发 video_init 同故事时靠 UNIQUE(path) 收敛，避免 SELECT→INSERT 竞态抛错
  d.prepare('INSERT OR IGNORE INTO story_registry (id, path, name, created_at) VALUES (?, ?, ?, ?)')
    .run(row.id, row.path, row.name, row.created_at)
  return d.prepare('SELECT * FROM story_registry WHERE path = ?').get(row.path) as StoryRow
}

export function listStories(): StoryRow[] {
  return mustDB().prepare('SELECT * FROM story_registry ORDER BY created_at').all() as StoryRow[]
}

// ---- decisions ----

export function insertDecision(node: DecisionNode): void {
  mustDB().prepare(`
    INSERT INTO decisions (id, created_at, session_id, decision, trigger, rationale, evidence, outcome, caused_by, supersedes, alternatives, taste_signals, scopes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    node.id, node.created_at, node.session_id, node.decision, node.trigger, node.rationale,
    node.evidence, node.outcome, node.caused_by, node.supersedes,
    JSON.stringify(node.alternatives ?? []), JSON.stringify(node.taste_signals ?? []), JSON.stringify(node.scopes ?? []),
  )
}

type RawDecision = Omit<DecisionNode, 'alternatives' | 'taste_signals' | 'scopes'> & {
  alternatives: string
  taste_signals: string
  scopes: string
}

function toNode(raw: RawDecision): DecisionNode {
  return {
    ...raw,
    alternatives: JSON.parse(raw.alternatives || '[]'),
    taste_signals: JSON.parse(raw.taste_signals || '[]'),
    scopes: JSON.parse(raw.scopes || '[]'),
  }
}

export function getRecentDecisions(limit: number): DecisionNode[] {
  if (!db) return []
  return (db.prepare('SELECT * FROM decisions ORDER BY created_at DESC LIMIT ?').all(limit) as RawDecision[])
    .map(toNode)
}

/** 关键词搜索（scope 下推进 SQL——先过滤后 LIMIT，避免 limit 截断后再过滤丢结果） */
export function searchDecisions(query: string, limit = 50, scope?: string): DecisionNode[] {
  if (!db) return []
  const like = `%${query}%`
  const sql = scope
    ? `SELECT * FROM decisions WHERE (decision LIKE ? OR rationale LIKE ? OR trigger LIKE ?) AND scopes LIKE ? ORDER BY created_at DESC LIMIT ?`
    : `SELECT * FROM decisions WHERE decision LIKE ? OR rationale LIKE ? OR trigger LIKE ? ORDER BY created_at DESC LIMIT ?`
  const params = scope ? [like, like, like, `%${scope}%`, limit] : [like, like, like, limit]
  return (db.prepare(sql).all(...params) as RawDecision[]).map(toNode)
}

export function getDecisionById(id: string): DecisionNode | null {
  if (!db) return null
  const raw = db.prepare('SELECT * FROM decisions WHERE id = ?').get(id) as RawDecision | undefined
  return raw ? toNode(raw) : null
}

/** 更新已有决策的 outcome（被新决策 supersedes 时把旧节点标记为 refined/reverted） */
export function updateDecisionOutcome(id: string, outcome: 'adopted' | 'reverted' | 'refined' | 'pending'): boolean {
  if (!db) return false
  const res = db.prepare('UPDATE decisions SET outcome = ? WHERE id = ?').run(outcome, id)
  return res.changes > 0
}