import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { knowledgeSearch, hitInTopK } from '../src/search.js'
import type { UserContext } from '../src/permissions.js'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const docsRoot = process.env.KB_DOCS_ROOT ?? join(pkgRoot, 'docs')
const indexPath = process.env.KB_INDEX_PATH ?? join(pkgRoot, 'data/index.json')

/** 试点基线：Top-5 命中率 ≥ 75%（业务方可调整 test/eval-queries.json） */
const BASELINE_HIT_RATE = 0.75

interface EvalCase {
  query: string
  expectedSources: string[]
  user?: UserContext
  expectEmpty?: boolean
  note?: string
}

describe('eval top-5 baseline', () => {
  it('meets pilot hit-rate on golden queries', async () => {
    const raw = await readFile(join(pkgRoot, 'test/eval-queries.json'), 'utf8')
    const cases = JSON.parse(raw) as EvalCase[]

    let passed = 0
    const failures: string[] = []

    for (const c of cases) {
      const result = await knowledgeSearch({
        docsRoot,
        indexPath,
        query: c.query,
        limit: 5,
        user: c.user,
      })

      if (c.expectEmpty) {
        if (result.hits.length === 0 || result.denied) {
          passed++
        } else {
          failures.push(`「${c.query}」应无命中，实际: ${result.hits.map((h) => h.source).join(', ')}`)
        }
        continue
      }

      if (hitInTopK(result.hits, c.expectedSources, 5)) {
        passed++
      } else {
        failures.push(
          `「${c.query}」期望 ${c.expectedSources.join('|')} in top-5，实际: ${result.hits.map((h) => h.source).join(', ') || '(空)'} [${result.mode}]`,
        )
      }
    }

    const rate = passed / cases.length
    console.log(`Top-5 eval: ${passed}/${cases.length} (${(rate * 100).toFixed(0)}%), baseline ${BASELINE_HIT_RATE * 100}%`)

    if (failures.length > 0) {
      console.log('Failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
    }

    assert.ok(rate >= BASELINE_HIT_RATE, `hit rate ${(rate * 100).toFixed(0)}% below baseline ${BASELINE_HIT_RATE * 100}%`)
  })
})
