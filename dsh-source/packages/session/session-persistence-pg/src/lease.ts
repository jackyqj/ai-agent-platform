/**
 * Cross-process write-ownership lock for one stored session, held for the
 * life of a write handle. PostgreSQL session-scoped advisory locks release
 * when the connection closes, including on process death.
 * @module @deepseek-ai/dsh-session-persistence-pg/lease
 */

import type { PoolClient } from 'pg'
import { SessionAlreadyOwnedError } from '@deepseek-ai/dsh-session-persistence'
import type { SessionId } from '@deepseek-ai/dsh-session'

/** Second advisory-lock key; the first key is `hashtext(dsh-session:<id>)`. */
const LOCK_CLASS = 42

/**
 * One held write lock. Constructed only by {@link SessionWriteLease.acquire};
 * `release` unlocks and returns the pooled client.
 */
export class SessionWriteLease {
  private released = false

  private constructor(
    private readonly client: PoolClient,
    private readonly id: SessionId,
  ) {}

  /**
   * Acquire a non-blocking advisory lock on `client`. On contention or any
   * other failure the client is released back to the pool.
   * @param client - a dedicated pooled connection that stays checked out
   *   for the life of the lock.
   * @param id - the session the lock guards.
   * @returns the held lock.
   * @throws {SessionAlreadyOwnedError} when another connection holds the lock.
   */
  static async acquire(client: PoolClient, id: SessionId): Promise<SessionWriteLease> {
    try {
      const { rows } = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtext($1), $2) AS locked',
        [`dsh-session:${id}`, LOCK_CLASS],
      )
      if (rows[0]?.locked !== true) throw new SessionAlreadyOwnedError(id)
      return new SessionWriteLease(client, id)
    } catch (error: unknown) {
      client.release()
      throw error
    }
  }

  /**
   * Unlock and return the connection. Idempotent.
   * @returns settlement of the unlock.
   */
  async release(): Promise<void> {
    if (this.released) return
    this.released = true
    try {
      await this.client.query(
        'SELECT pg_advisory_unlock(hashtext($1), $2)',
        [`dsh-session:${this.id}`, LOCK_CLASS],
      )
    } finally {
      this.client.release()
    }
  }
}
