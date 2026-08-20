import assert from 'node:assert/strict'
import { test } from 'node:test'
import { UsersService } from './users.service.js'

test('patch disables a seeded user', () => {
  const users = new UsersService()
  const u = users.patch('u-hr-1', { status: 'disabled' })
  assert.equal(u?.status, 'disabled')
  assert.equal(users.get('u-hr-1')?.status, 'disabled')
})

test('patch updates role override and department', () => {
  const users = new UsersService()
  const u = users.patch('u-hr-1', { role: 'developer', dept: '研发部' })
  assert.equal(u?.role, 'developer')
  assert.equal(u?.dept, '研发部')
})

test('patch returns undefined for unknown user', () => {
  const users = new UsersService()
  assert.equal(users.patch('no-such', { status: 'disabled' }), undefined)
})

test('re-enable restores active status', () => {
  const users = new UsersService()
  users.patch('u-hr-1', { status: 'disabled' })
  const u = users.patch('u-hr-1', { status: 'active' })
  assert.equal(u?.status, 'active')
})
