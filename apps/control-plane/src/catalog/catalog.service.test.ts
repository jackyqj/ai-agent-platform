import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AuditStore } from '../common/audit.store.js'
import { can } from '../common/permissions.js'
import { CredentialVault } from '../secrets/vault.js'
import { SecretsService } from '../secrets/secrets.service.js'
import { PgStore } from '../store/pg.store.js'
import { CatalogService, type CatalogDeps } from './catalog.service.js'
import type { GraphSpec } from './types.js'

const MASTER = 'test-catalog-master'

function svc(opts?: Pick<CatalogDeps, 'fetchFn' | 'queryPg' | 'runAgent' | 'getAgentTask'>) {
  const pg = new PgStore(undefined)
  const vault = new CredentialVault(null, MASTER)
  const secrets = new SecretsService(vault, { SECRETS_MASTER_KEY: MASTER })
  const agents = {
    get: async (id: string) => (id === 'assistant' ? { id, status: 'published' } : undefined),
  }
  return {
    secrets,
    catalog: new CatalogService(pg, new AuditStore(pg), secrets, {
      agents,
      runAgent: opts?.runAgent ?? (async ({ task }) => ({ output: `agent:${task}` })),
      getAgentTask: opts?.getAgentTask,
      fetchFn: opts?.fetchFn,
      queryPg: opts?.queryPg,
    }),
  }
}

const httpConn = {
  id: 'erp',
  name: 'ERP',
  kind: 'http' as const,
  secretRef: 'ERP_TOKEN',
  http: { baseUrl: 'https://erp.example.com', allowedMethods: ['GET' as const] },
}

const pgConn = {
  id: 'sales-db',
  name: '销售库',
  kind: 'postgres' as const,
  secretRef: 'SALES_DSN',
  postgres: { allowedTables: ['demo_sales.orders'], maxRows: 20 },
}

test('connector.manage and graph.publish are admin-only; graph.edit includes developer', () => {
  assert.equal(can('admin', 'connector.manage'), true)
  assert.equal(can('employee', 'connector.manage'), false)
  assert.equal(can('developer', 'graph.edit'), true)
  assert.equal(can('employee', 'graph.edit'), false)
  assert.equal(can('developer', 'graph.publish'), false)
  assert.equal(can('admin', 'graph.publish'), true)
})

test('employee only sees published graphs in visibility', async () => {
  const { catalog, secrets } = svc()
  await secrets.set('ERP_TOKEN', 'tok')
  await catalog.putConnector(httpConn, 'u-admin')
  await catalog.publishConnector('erp', 'u-admin')
  await catalog.putTool({
    id: 'get-invoice',
    connectorId: 'erp',
    name: 'get_invoice',
    description: '按号查发票',
    risk: 'read',
    binding: { kind: 'http', method: 'GET', pathTemplate: '/invoices/{{args.id}}' },
  }, 'u-admin')
  await catalog.publishTool('get-invoice', 'u-admin')

  const spec: GraphSpec = {
    onError: 'stop',
    nodes: [
      { id: 'pull', kind: 'tool', toolId: 'get-invoice', argsTemplate: { id: '{{input.invoiceId}}' } },
      { id: 'write', kind: 'agent', agentPresetId: 'assistant', promptTemplate: '根据数据写摘要：{{nodes.pull.output}}' },
    ],
    edges: [{ from: 'pull', to: 'write' }],
  }
  await catalog.putGraph({ id: 'invoice-pack', name: '发票摘要', spec, visibility: { roles: ['employee', 'admin'] } }, 'u-dev')
  assert.equal((await catalog.listGraphsFor('employee', 'IT')).length, 0)
  await catalog.publishGraph('invoice-pack', 'u-admin')
  const listed = await catalog.listGraphsFor('employee', 'IT')
  assert.equal(listed.length, 1)
  assert.equal(listed[0]?.id, 'invoice-pack')
  await catalog.unpublishGraph('invoice-pack', 'u-admin')
  assert.equal((await catalog.listGraphsFor('employee', 'IT')).length, 0)
})

test('cycle is rejected; unknown agent is rejected on publish not on draft put', async () => {
  const { catalog } = svc()
  await assert.rejects(
    () => catalog.putGraph({
      id: 'bad-cycle',
      name: '环',
      spec: {
        onError: 'stop',
        nodes: [
          { id: 'a', kind: 'agent', agentPresetId: 'assistant', promptTemplate: 'a' },
          { id: 'b', kind: 'agent', agentPresetId: 'assistant', promptTemplate: 'b' },
        ],
        edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
      },
    }, 'u'),
    /环/,
  )
  const empty = await catalog.putGraph({
    id: 'empty-draft',
    name: '空',
    spec: { onError: 'stop', nodes: [], edges: [] },
  }, 'u')
  assert.equal(empty.status, 'draft')
  await catalog.putGraph({
    id: 'bad-agent',
    name: '无',
    spec: {
      onError: 'stop',
      nodes: [{ id: 'a', kind: 'agent', agentPresetId: 'nope', promptTemplate: 'x' }],
      edges: [],
    },
  }, 'u')
  await assert.rejects(() => catalog.publishGraph('bad-agent', 'u-admin'), /未发布/)
})

test('tool node calls HTTP with interpolating path; employee cannot use unpublished graph', async () => {
  const calls: string[] = []
  const { catalog, secrets } = svc({
    fetchFn: async (url) => {
      calls.push(url)
      return { status: 200, text: async () => '{"ok":true,"n":1}' }
    },
  })
  await secrets.set('ERP_TOKEN', 'tok')
  await catalog.putConnector(httpConn, 'admin')
  await catalog.publishConnector('erp', 'admin')
  await catalog.putTool({
    id: 'get-invoice',
    connectorId: 'erp',
    name: 'get_invoice',
    description: '',
    risk: 'read',
    binding: { kind: 'http', method: 'GET', pathTemplate: '/invoices/{{args.id}}' },
  }, 'admin')
  await catalog.publishTool('get-invoice', 'admin')
  await catalog.putGraph({
    id: 'inv',
    name: '查票',
    spec: {
      onError: 'stop',
      nodes: [
        { id: 'pull', kind: 'tool', toolId: 'get-invoice', argsTemplate: { id: '{{input.invoiceId}}' } },
        { id: 'sum', kind: 'agent', agentPresetId: 'assistant', promptTemplate: '{{nodes.pull.output}}' },
      ],
      edges: [{ from: 'pull', to: 'sum' }],
    },
  }, 'admin')
  await catalog.publishGraph('inv', 'admin')
  const run = await catalog.runGraph('inv', 'u-hr-1', 'employee', '人事', { invoiceId: 'INV-9' })
  assert.equal(run.status, 'done')
  assert.equal(calls[0], 'https://erp.example.com/invoices/INV-9')
  assert.match(run.result ?? '', /agent:/)
})

test('postgres tool rejects writes and off-whitelist tables', async () => {
  const { catalog, secrets } = svc({
    queryPg: async () => ({ rows: [{ n: 1 }] }),
  })
  await secrets.set('SALES_DSN', 'postgres://x')
  await catalog.putConnector(pgConn, 'admin')
  await catalog.publishConnector('sales-db', 'admin')
  await catalog.putTool({
    id: 'q',
    connectorId: 'sales-db',
    name: 'query',
    description: '',
    risk: 'read',
    binding: { kind: 'postgres', mode: 'query_readonly' },
  }, 'admin')
  await catalog.publishTool('q', 'admin')
  await catalog.putGraph({
    id: 'sales',
    name: '销售查询',
    spec: {
      onError: 'stop',
      nodes: [{ id: 'q1', kind: 'tool', toolId: 'q', argsTemplate: { sql: '{{input.sql}}' } }],
      edges: [],
    },
  }, 'admin')
  await catalog.publishGraph('sales', 'admin')

  const del = await catalog.runGraph('sales', 'u', 'employee', 'IT', { sql: 'DELETE FROM demo_sales.orders' })
  assert.equal(del.status, 'failed')
  assert.match(del.error ?? '', /只允许 SELECT/)

  const badTable = await catalog.runGraph('sales', 'u', 'employee', 'IT', { sql: 'SELECT * FROM public.tasks' })
  assert.equal(badTable.status, 'failed')
  assert.match(badTable.error ?? '', /白名单外/)

  const ok = await catalog.runGraph('sales', 'u', 'employee', 'IT', { sql: 'SELECT * FROM demo_sales.orders' })
  assert.equal(ok.status, 'done')
})

test('must publish connector before tool; cannot delete connector in use', async () => {
  const { catalog } = svc()
  await catalog.putConnector(httpConn, 'admin')
  await catalog.putTool({
    id: 't1',
    connectorId: 'erp',
    name: 't',
    description: '',
    risk: 'read',
    binding: { kind: 'http', method: 'GET', pathTemplate: '/x' },
  }, 'admin')
  await assert.rejects(() => catalog.publishTool('t1', 'admin'), /先发布连接器/)
  await assert.rejects(() => catalog.deleteConnector('erp', 'admin'), /仍有工具/)
})

test('publish connector refuses missing secretRef; trial runs draft; revisions + rollback', async () => {
  const { catalog, secrets } = svc({
    fetchFn: async () => ({ status: 200, text: async () => 'ok' }),
  })
  await catalog.putConnector(httpConn, 'admin')
  await assert.rejects(() => catalog.publishConnector('erp', 'admin'), /未配置/)
  await secrets.set('ERP_TOKEN', 'tok')
  await catalog.publishConnector('erp', 'admin')
  await catalog.putTool({
    id: 'get-invoice',
    connectorId: 'erp',
    name: 'get',
    description: '',
    risk: 'read',
    binding: { kind: 'http', method: 'GET', pathTemplate: '/invoices/{{args.id}}' },
  }, 'admin')
  await catalog.publishTool('get-invoice', 'admin')

  const specV1: GraphSpec = {
    onError: 'stop',
    nodes: [{ id: 'pull', kind: 'tool', toolId: 'get-invoice', argsTemplate: { id: '{{input.invoiceId}}' } }],
    edges: [],
  }
  await catalog.putGraph({ id: 'pack', name: 'v1', spec: specV1 }, 'admin')
  const trial = await catalog.trialRunGraph('pack', 'u-admin', { invoiceId: 'A1' })
  assert.equal(trial.status, 'done')
  assert.equal((await catalog.listGraphsFor('employee', 'IT')).length, 0)

  await catalog.publishGraph('pack', 'admin')
  let revs = await catalog.listGraphRevisions('pack')
  assert.equal(revs.length, 1)
  assert.equal(revs[0]?.version, 1)

  const specV2: GraphSpec = {
    onError: 'stop',
    nodes: [
      { id: 'pull', kind: 'tool', toolId: 'get-invoice', argsTemplate: { id: '{{input.invoiceId}}' } },
      { id: 'sum', kind: 'agent', agentPresetId: 'assistant', promptTemplate: '{{nodes.pull.output}}' },
    ],
    edges: [{ from: 'pull', to: 'sum' }],
  }
  await catalog.putGraph({ id: 'pack', name: 'v2', spec: specV2 }, 'admin')
  await catalog.publishGraph('pack', 'admin')
  revs = await catalog.listGraphRevisions('pack')
  assert.equal(revs.length, 2)

  const rolled = await catalog.rollbackGraph('pack', 1, 'admin')
  assert.equal(rolled.version, 3)
  assert.equal(rolled.spec.nodes.length, 1)
  assert.equal(rolled.name, 'v1')
})

test('trial awaiting approval resumes after task completes and keeps prior steps', async () => {
  let taskStatus = 'queued'
  const { catalog, secrets } = svc({
    fetchFn: async () => ({ status: 200, text: async () => 'invoice-9' }),
    runAgent: async () => ({ output: 'awaitingApproval:task-1', awaitingApproval: true, taskId: 'task-1' }),
    getAgentTask: async () => (
      taskStatus === 'done'
        ? { status: 'done', output: '已批准摘要' }
        : { status: taskStatus }
    ),
  })
  await secrets.set('ERP_TOKEN', 'tok')
  await catalog.putConnector(httpConn, 'admin')
  await catalog.publishConnector('erp', 'admin')
  await catalog.putTool({
    id: 'get-invoice',
    connectorId: 'erp',
    name: 'get',
    description: '',
    risk: 'read',
    binding: { kind: 'http', method: 'GET', pathTemplate: '/invoices/{{args.id}}' },
  }, 'admin')
  await catalog.publishTool('get-invoice', 'admin')
  await catalog.putGraph({
    id: 'pack-approve',
    name: '审批图',
    spec: {
      onError: 'stop',
      nodes: [
        { id: 'pull', kind: 'tool', toolId: 'get-invoice', argsTemplate: { id: '{{input.invoiceId}}' } },
        { id: 'sum', kind: 'agent', agentPresetId: 'assistant', promptTemplate: '{{nodes.pull.output}}' },
      ],
      edges: [{ from: 'pull', to: 'sum' }],
    },
  }, 'admin')

  const paused = await catalog.trialRunGraph('pack-approve', 'u-admin', { invoiceId: 'A1' })
  assert.equal(paused.status, 'awaiting_approval')
  assert.equal(paused.steps[0]?.status, 'done')
  assert.equal(paused.steps[1]?.status, 'awaiting_approval')

  const still = await catalog.getRun(paused.id, 'u-admin', true)
  assert.equal(still.status, 'awaiting_approval')
  assert.equal(still.steps[0]?.output, 'invoice-9')

  taskStatus = 'done'
  const resumed = await catalog.getRun(paused.id, 'u-admin', true)
  assert.equal(resumed.status, 'done')
  assert.equal(resumed.steps[0]?.output, 'invoice-9')
  assert.equal(resumed.steps[1]?.status, 'done')
  assert.equal(resumed.steps[1]?.output, '已批准摘要')
  const latest = await catalog.latestRun('pack-approve')
  assert.equal(latest?.id, paused.id)
  assert.equal(latest?.status, 'done')
})
