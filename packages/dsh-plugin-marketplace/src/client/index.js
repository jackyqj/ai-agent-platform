import { createElement as h, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { badgeCount, loginCommand, rowAction, stateLabel } from '../panel-model.js'

const XB_MARK = '#ef5b2b'

const CSS = `
.bienen-layer{position:relative;flex:none;display:flex;align-items:center;width:100%;height:42px;margin:8px 0 0}
.bienen-trigger{display:inline-flex;align-items:center;gap:8px;width:calc(100% + 4px);height:42px;margin:0 -2px;padding:0 10px 0 8px;border:none;border-radius:10px;background:var(--dsw-specific-menu,#fff);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;overflow:hidden;box-shadow:0 0 0 1px var(--dsw-alias-border-l1,#e5e5e5)}
.bienen-trigger:hover,.bienen-trigger[data-active]{background:#fff7ed;box-shadow:0 0 0 1px #fdba74}
.bienen-dotn{width:16px;height:16px;border-radius:999px;background:${XB_MARK};color:#fff;font-size:9px;display:grid;place-items:center;font-weight:700;flex:none}
.bienen-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bienen-count{margin-left:auto;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:${XB_MARK};color:#fff;font-size:11px;line-height:18px;text-align:center}
.bienen-mark{display:grid;place-items:center;border-radius:9px;background:${XB_MARK};color:#fff;font-weight:700;line-height:1;flex:none}
.bienen-name{font-weight:600;font-size:13px;color:var(--dsw-alias-label-primary,#292929)}
.bienen-panel{position:fixed;z-index:40;width:min(360px,calc(100vw - 24px));max-height:min(480px,70vh);display:flex;flex-direction:column;border-radius:12px;background:var(--dsw-specific-menu,#fff);color:var(--dsw-alias-label-primary,#0f1115);box-shadow:var(--dsw-elevation-prominent,0 8px 32px rgba(0,0,0,.18));overflow:hidden}
.bienen-head,.bienen-foot{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}
.bienen-head{color:var(--dsw-alias-label-primary,#0f1115);font-size:14px;font-weight:500}
.bienen-foot{border-bottom:none;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));margin-top:auto}
.bienen-body{overflow:auto;padding:8px 12px 12px;font-size:13px;color:var(--dsw-alias-label-primary,#0f1115)}
.bienen-error{margin:0 0 8px;color:var(--dsw-alias-state-error-primary,#c00)}
.bienen-group{margin:12px 0 6px;font-size:11px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-caption,#6b7280)}
.bienen-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}
.bienen-title{flex:1;min-width:0;color:var(--dsw-alias-label-primary,#0f1115)}
.bienen-ver{font-size:12px;color:var(--dsw-alias-label-tertiary,#6b7280)}
.bienen-chip{font-size:11px;color:var(--dsw-alias-label-secondary,#4b5563)}
.bienen-btn{border:none;border-radius:8px;padding:4px 8px;font:inherit;font-size:12px;cursor:pointer;background:var(--dsw-alias-interactive-bg-hover-solid,#eee);color:var(--dsw-alias-label-primary,#0f1115)}
.bienen-btn:disabled{opacity:.5;cursor:default}
.bienen-pre{white-space:pre-wrap;font-size:12px;user-select:all;color:var(--dsw-alias-label-primary,#0f1115)}
`

function ensureCss() {
  if (typeof document === 'undefined') return
  let tag = document.querySelector('style[data-plugin-css="bienen-market"]')
  if (tag === null) {
    tag = document.createElement('style')
    tag.dataset.pluginCss = 'bienen-market'
    document.head.appendChild(tag)
  }
  tag.textContent = CSS
}

async function readStatus() {
  const res = await fetch('/bienen/status')
  return res.json()
}

async function postApply(body) {
  const res = await fetch('/bienen/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  return res.json()
}

function versionLine(row) {
  return `${row.localVersion ?? '—'} → ${row.remoteVersion}`
}

function CatalogSection({ title, rows, empty, busy, onApply }) {
  return h('section', null,
    h('h3', { className: 'bienen-group' }, title),
    rows.length === 0
      ? h('p', null, empty)
      : rows.map((row) => {
        const action = rowAction(row.state)
        const key = row.slug ?? row.id
        return h('div', { key, className: 'bienen-row', 'data-bienen-row': key, 'data-state': row.state },
          h('div', { className: 'bienen-title' }, row.title ?? key),
          h('span', { className: 'bienen-ver' }, versionLine(row)),
          h('span', { className: 'bienen-chip' }, stateLabel(row.state)),
          action === null
            ? (row.state === 'conflict'
              ? h('span', { className: 'bienen-ver' }, '终端 dsh-biene sync --force')
              : null)
            : h('button', {
              type: 'button',
              className: 'bienen-btn',
              disabled: busy,
              onClick: () => { void onApply(row.slug ? { skill: row.slug } : { agent: row.id }) },
            }, action === 'update' ? '更新' : '应用'),
        )
      }),
  )
}

export function BienenPanel({ wide }) {
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState(undefined)
  const [snap, setSnap] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { ensureCss() }, [])
  useEffect(() => { void readStatus().then(setSnap) }, [])

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (rect) setAnchor({ left: rect.left, bottom: window.innerHeight - rect.top + 8 })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const badge = snap ? badgeCount(snap) : 0
  const signedOut = snap?.loggedIn === false

  const runApply = async (body) => {
    setBusy(true)
    try { setSnap(await postApply(body)) } finally { setBusy(false) }
  }

  return h('div', { ref: rootRef, className: 'bienen-layer' },
    open && anchor
      ? h('section', {
        className: 'bienen-panel',
        style: { left: anchor.left, bottom: anchor.bottom },
        'data-bienen-panel': '',
        'aria-label': '小彼恩',
      },
      h('header', { className: 'bienen-head' }, h('strong', null, '小彼恩')),
      h('div', { className: 'bienen-body' },
        snap?.error && !signedOut ? h('p', { className: 'bienen-error', role: 'alert' }, snap.error.message) : null,
        signedOut
          ? h('div', null,
            h('p', null, '未登录。在终端运行：'),
            h('pre', { className: 'bienen-pre' }, loginCommand(snap.serverUrl)),
          )
          : h('div', null,
            h(CatalogSection, {
              title: 'Skill',
              rows: snap?.skills ?? [],
              empty: '没有可见的已发布项',
              busy,
              onApply: runApply,
            }),
            h(CatalogSection, {
              title: 'Agent',
              rows: snap?.agents ?? [],
              empty: '没有可见的已发布项',
              busy,
              onApply: runApply,
            }),
          ),
      ),
      signedOut ? null : h('div', { className: 'bienen-foot' },
        h('button', {
          type: 'button', className: 'bienen-btn', disabled: busy,
          onClick: () => { void readStatus().then(setSnap) },
        }, '刷新'),
        h('button', {
          type: 'button', className: 'bienen-btn', disabled: busy,
          onClick: () => { void runApply({}) },
        }, '全部应用'),
      ),
      )
      : null,
    h('button', {
      type: 'button',
      className: 'bienen-trigger',
      'data-active': open || undefined,
      'aria-label': '小彼恩',
      'aria-expanded': open,
      onClick: () => { setOpen((v) => !v) },
    },
    h('span', { className: 'bienen-dotn', 'aria-hidden': true }, '彼'),
    wide ? h('span', { className: 'bienen-label' }, '小彼恩') : null,
    badge > 0 ? h('span', { className: 'bienen-count' }, String(badge)) : null,
    ),
  )
}

function XiaobienMark({ size = 24 }) {
  const edge = typeof size === 'number' ? size : 24
  return h('span', {
    className: 'bienen-mark',
    style: { width: edge, height: edge, fontSize: Math.round(edge * 0.52) },
    'aria-hidden': true,
  }, '彼')
}

function XiaobienName() {
  return h('span', { className: 'bienen-name' }, '小彼恩dsh')
}

export const inject = ['slots']

export function apply(ctx) {
  ensureCss()
  if (typeof document !== 'undefined' && document.title !== '小彼恩dsh') {
    document.title = '小彼恩dsh'
  }
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark', priority: 20 }, XiaobienMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name', priority: 20 }, XiaobienName)
    }))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'bienen-market',
    order: 10,
    label: '小彼恩',
  }, BienenPanel))
}
