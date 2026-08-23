/**
 * permissions.ts — 文档可见性与用户权限过滤（17 工单，D18 数据分级对接 v1）
 *
 * 文档元数据来自 docs/manifest.json；检索时在 Server 端强制过滤，Agent 层不可绕过。
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** D18 数据分级：公开 / 内部 / 机密 */
export type Classification = 'public' | 'internal' | 'confidential'

export interface DocVisibility {
  classification: Classification
  /** 可见部门；空数组或含 "*" 表示全员 */
  departments: string[]
  /** 机密文档所需角色；空表示不额外限制角色 */
  roles: string[]
  /** 指定用户 ID 白名单（可选） */
  users?: string[]
}

export interface UserContext {
  userId?: string
  departments?: string[]
  roles?: string[]
}

export type DocManifest = Record<string, DocVisibility>

const DEFAULT_VISIBILITY: DocVisibility = {
  classification: 'internal',
  departments: ['*'],
  roles: [],
}

export async function loadManifest(docsRoot: string): Promise<DocManifest> {
  try {
    const raw = await readFile(join(docsRoot, 'manifest.json'), 'utf8')
    return JSON.parse(raw) as DocManifest
  } catch {
    return {}
  }
}

export function resolveVisibility(manifest: DocManifest, source: string): DocVisibility {
  return manifest[source] ?? DEFAULT_VISIBILITY
}

/** 判断用户是否有权访问该文档 */
export function canAccess(vis: DocVisibility, user: UserContext | undefined): boolean {
  if (vis.classification === 'public') return true

  // 内部/机密文档需要用户上下文
  if (!user) return false

  // 用户白名单
  if (vis.users?.length) {
    if (!user.userId || !vis.users.includes(user.userId)) return false
  }

  // 机密文档需要匹配角色
  if (vis.classification === 'confidential') {
    if (vis.roles.length > 0) {
      const userRoles = user.roles ?? []
      if (!vis.roles.some((r) => userRoles.includes(r))) return false
    }
  }

  // 部门过滤
  const depts = vis.departments
  if (depts.length === 0 || depts.includes('*')) return true
  const userDepts = user.departments ?? []
  return depts.some((d) => userDepts.includes(d))
}
