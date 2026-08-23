/**
 * admin-cli.ts — 供 control-plane 调用的管理 CLI
 *   node dist/admin-cli.js search '<json>'
 */
import { knowledgeSearch } from './search.js'

const cmd = process.argv[2]
if (cmd === 'search') {
  const body = JSON.parse(process.argv[3] ?? '{}') as {
    docsRoot: string
    indexPath: string
    query: string
    limit?: number
    user?: { userId?: string; departments?: string[]; roles?: string[] }
  }
  const result = await knowledgeSearch({
    docsRoot: body.docsRoot,
    indexPath: body.indexPath,
    query: body.query,
    limit: body.limit ?? 5,
    user: body.user,
  })
  process.stdout.write(JSON.stringify({ hits: result.hits, mode: result.mode, denied: result.denied }))
} else {
  console.error('usage: admin-cli.js search <json>')
  process.exit(1)
}
