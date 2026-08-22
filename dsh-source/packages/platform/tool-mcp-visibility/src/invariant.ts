/**
 * Package-owned invariant companion for `@company/dsh-tool-mcp-visibility`.
 * @module @company/dsh-tool-mcp-visibility/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@company/dsh-tool-mcp-visibility'

/** Cordis companion plugin name. */
export const name = 'mcp-visibility-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package makes exactly one scoped call into
 * `ctx.tools.restrict()` and owns no event or snapshot of its own; the
 * relation it establishes — which tools one agent's assembly sees — is the
 * tool registry's to hold, and `dsh-tools` observes it there.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
