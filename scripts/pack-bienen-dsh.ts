/**
 * Pack the dsh family after a branded (non-official) client build.
 * Upstream pack.ts refuses any title other than "DeepSeek Harness".
 */
import { existsSync, globSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readClientBuildRecord } from '../dsh-source/scripts/client-build-environment.ts'
import { releaseFamily, tarballName, type ReleaseMember } from '../dsh-source/scripts/release/families.ts'
import { run } from '../dsh-source/scripts/release/process.ts'
import { PUBLISH_ORDER_FILE, tarballFiles } from '../dsh-source/scripts/release/tarball.ts'

const EXPECTED_TITLE = '小彼恩dsh'

function deepseekMembers(root: string, patterns: readonly string[]): ReleaseMember[] {
  const members: ReleaseMember[] = []
  for (const manifestPath of globSync([...patterns], { cwd: root }).sort()) {
    const normalized = manifestPath.replaceAll('\\', '/')
    const parsed: unknown = JSON.parse(readFileSync(resolve(root, normalized), 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) continue
    const manifest = parsed as Record<string, unknown>
    const name = manifest.name
    const version = manifest.version
    if (typeof name !== 'string' || typeof version !== 'string') continue
    if (!name.startsWith('@deepseek-ai/')) continue
    members.push({
      directory: normalized.slice(0, normalized.length - '/package.json'.length),
      name,
      version,
      manifest,
    })
  }
  return members
}

function main(): void {
  const { values } = parseArgs({
    options: { out: { type: 'string' } },
    allowPositionals: false,
  })
  const root = resolve(import.meta.dirname, '../dsh-source')
  const record = readClientBuildRecord(root)
  const title = record.environment.DSH_CLIENT_TITLE
  if (title !== EXPECTED_TITLE) {
    throw new Error(`branded pack expected DSH_CLIENT_TITLE=${EXPECTED_TITLE}, got ${JSON.stringify(title)}`)
  }
  if (record.environment.DSH_CLIENT_BUILD_PROFILE === 'official') {
    throw new Error('refusing to pack an official DeepSeek client; unset DSH_BUILD_CLIENT_PROFILE and rebuild')
  }

  const family = releaseFamily('dsh')
  const destination = resolve(root, values.out ?? 'dist/npm')
  // family.members() rejects @company/* workspace packages that live under packages/.
  const members = family.publishOrder(deepseekMembers(root, family.patterns)).order
  family.verifyVersions(members)

  rmSync(destination, { recursive: true, force: true })
  mkdirSync(destination, { recursive: true })

  const order: string[] = []
  for (const member of members) {
    run('pnpm', ['--dir', member.directory, 'pack', '--pack-destination', destination])
    const filename = tarballName(member)
    const tarball = join(destination, filename)
    if (!existsSync(tarball)) throw new Error(`${member.name} produced no tarball at ${tarball}`)
    family.validatePayload(member, tarballFiles(tarball))
    order.push(filename)
  }
  writeFileSync(join(destination, PUBLISH_ORDER_FILE), `${order.join('\n')}\n`)
  console.log(`bienen pack: ${String(order.length)} tarball(s) in ${destination}`)
}

main()
