import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isSessionAlreadyExists,
  isSessionNotFound,
  promptOnSession,
} from './session-open.js'

test('recognizes persistence not-found and already-exists from wire text', () => {
  const id = '9ed7b0b7-9d68-4797-b8f3-07c3f7483df2'
  assert.equal(isSessionNotFound(new Error(`session "${id}" not found`), id), true)
  assert.equal(isSessionNotFound(new Error('session not found'), id), true)
  assert.equal(isSessionAlreadyExists(new Error(`session "${id}" already exists`), id), true)
  assert.equal(isSessionAlreadyExists(new Error(`session "${id}" already exists (attempts=3/3)`), id), true)
  assert.equal(isSessionAlreadyExists(new Error('session "other" already exists'), id), false)
})

test('creates on the first prompt when resume says the session is missing', async () => {
  const calls: string[] = []
  const result = await promptOnSession(
    {
      resumeSession: async (id) => {
        calls.push(`resume:${id}`)
        throw new Error(`session "${id}" not found`)
      },
      run: async (input, options) => {
        calls.push(`run:${options.sessionId}:${input}`)
        return 'created'
      },
    },
    'sess-new',
    'hi',
  )
  assert.equal(result, 'created')
  assert.deepEqual(calls, ['resume:sess-new', 'run:sess-new:hi'])
})

test('resumes then prompts when the session is already persisted', async () => {
  const calls: string[] = []
  const result = await promptOnSession(
    {
      resumeSession: async (id) => { calls.push(`resume:${id}`) },
      run: async (input, options) => {
        calls.push(`run:${options.sessionId}:${input}`)
        return 'continued'
      },
    },
    'sess-old',
    'next',
  )
  assert.equal(result, 'continued')
  assert.deepEqual(calls, ['resume:sess-old', 'run:sess-old:next'])
})

test('binds workspace after resume and before the prompt', async () => {
  const calls: string[] = []
  const result = await promptOnSession(
    {
      resumeSession: async (id) => { calls.push(`resume:${id}`) },
      run: async (input, options) => {
        calls.push(`run:${options.sessionId}:${input}`)
        return 'bound'
      },
    },
    'sess-old',
    'next',
    async (id) => { calls.push(`bind:${id}`) },
  )
  assert.equal(result, 'bound')
  assert.deepEqual(calls, ['resume:sess-old', 'bind:sess-old', 'run:sess-old:next'])
})

test('does not bind workspace when the session is created on first prompt', async () => {
  const calls: string[] = []
  await promptOnSession(
    {
      resumeSession: async (id) => {
        calls.push(`resume:${id}`)
        throw new Error(`session "${id}" not found`)
      },
      run: async (input, options) => {
        calls.push(`run:${options.sessionId}:${input}`)
        return 'created'
      },
    },
    'sess-new',
    'hi',
    async (id) => { calls.push(`bind:${id}`) },
  )
  assert.deepEqual(calls, ['resume:sess-new', 'run:sess-new:hi'])
})

test('recovers create collisions by resuming then prompting again', async () => {
  const calls: string[] = []
  let resumes = 0
  let runs = 0
  const result = await promptOnSession(
    {
      resumeSession: async (id) => {
        calls.push(`resume:${id}`)
        resumes += 1
        if (resumes === 1) throw new Error(`session "${id}" not found`)
      },
      run: async (input, options) => {
        calls.push(`run:${options.sessionId}:${input}`)
        runs += 1
        if (runs === 1) throw new Error(`session "${options.sessionId}" already exists`)
        return 'recovered'
      },
    },
    'sess-race',
    'hi',
  )
  assert.equal(result, 'recovered')
  assert.deepEqual(calls, [
    'resume:sess-race',
    'run:sess-race:hi',
    'resume:sess-race',
    'run:sess-race:hi',
  ])
})

test('binds workspace after the recovered resume, before the second prompt', async () => {
  const calls: string[] = []
  let resumes = 0
  let runs = 0
  await promptOnSession(
    {
      resumeSession: async (id) => {
        calls.push(`resume:${id}`)
        resumes += 1
        if (resumes === 1) throw new Error(`session "${id}" not found`)
      },
      run: async (input, options) => {
        calls.push(`run:${options.sessionId}:${input}`)
        runs += 1
        if (runs === 1) throw new Error(`session "${options.sessionId}" already exists`)
        return 'recovered'
      },
    },
    'sess-race',
    'hi',
    async (id) => { calls.push(`bind:${id}`) },
  )
  assert.deepEqual(calls, [
    'resume:sess-race',
    'run:sess-race:hi',
    'resume:sess-race',
    'bind:sess-race',
    'run:sess-race:hi',
  ])
})
