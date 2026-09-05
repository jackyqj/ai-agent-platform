import assert from 'node:assert/strict'
import { test } from 'node:test'
import { starsFromWilson, wilsonLowerBound } from './wilson.js'

test('wilson lower bound is 0 with no votes', () => {
  assert.equal(wilsonLowerBound(0, 0), 0)
})

test('wilson penalizes small samples versus a perfect large sample', () => {
  const oneLike = wilsonLowerBound(1, 0)
  const tenLikes = wilsonLowerBound(10, 0)
  assert.ok(oneLike > 0)
  assert.ok(tenLikes > oneLike)
  assert.ok(tenLikes < 1)
  // 10 likes / 0 dislikes, z=1.96 → ≈0.7225 (known worked example)
  assert.ok(Math.abs(tenLikes - 0.7225) < 0.001)
})

test('stars map the unit interval onto a 0–5 scale with one decimal', () => {
  assert.equal(starsFromWilson(0), 0)
  assert.equal(starsFromWilson(1), 5)
  assert.equal(starsFromWilson(0.7225), 3.6)
})
