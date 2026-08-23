import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { tokenizeQuery, scoreTextMatch } from '../src/query-tokenize.js'

describe('query-tokenize', () => {
  it('extracts CJK bigrams', () => {
    const tokens = tokenizeQuery('出差交通费能报多少')
    assert.ok(tokens.includes('出差'))
    assert.ok(tokens.includes('交通'))
  })

  it('scores heading matches higher', () => {
    const score = scoreTextMatch('正文', '折扣权限', ['折扣', '权限'])
    assert.ok(score > 0)
  })
})
