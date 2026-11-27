import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const cordis = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../worker.cordis.yml'),
  'utf8',
)

function entryBlock(id: string): string {
  const re = new RegExp(`(?:^|\\n)- id: ${id}\\n([\\s\\S]*?)(?=\\n- id: |\\n- insert:|$)`)
  const match = re.exec(cordis)
  assert.ok(match, `missing cordis entry ${id}`)
  return match[1] ?? ''
}

test('employee runtime disables repo AGENTS.md injection', () => {
  const body = entryBlock('agent-instructions')
  assert.match(body, /disabled:\s*true/)
  assert.match(body, /maxBytes:\s*0/)
  assert.match(body, /instructionFileCandidates:\s*\[\]/)
  assert.match(body, /localInstructionFileCandidates:\s*\[\]/)
})

test('employee runtime does not catalog host or repo skills', () => {
  const skills = entryBlock('skill-filesystem')
  assert.match(skills, /includeDefaultRoots:\s*false/)
  assert.match(skills, /customSkillDirs:\s*\[\]/)
  assert.match(skills, /watch:\s*false/)
  assert.match(entryBlock('tool-skill'), /disabled:\s*true/)
  assert.match(entryBlock('skill-office'), /disabled:\s*true/)
  assert.match(entryBlock('upstream-skills'), /disabled:\s*true/)
})

test('employee runtime confines file reads to the session workspace', () => {
  assert.match(entryBlock('fs-sandbox'), /disabled:\s*true/)
  assert.match(cordis, /id: fs-sandbox-read/)
  assert.match(cordis, /@deepseek-ai\/dsh-fs-sandbox-read/)
  assert.match(entryBlock('tool-fs-search'), /disabled:\s*true/)
})
