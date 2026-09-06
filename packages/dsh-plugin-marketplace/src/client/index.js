import { createElement as h, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { badgeCount, loginCommand, rowAction, stateLabel } from '../panel-model.js'

const CSS = `
.bienen-layer{position:relative;flex:none;display:flex;align-items:center;width:100%;height:42px;margin:8px 0 0}
.bienen-trigger{display:inline-flex;align-items:center;gap:8px;width:calc(100% + 4px);height:42px;margin:0 -2px;padding:0 10px 0 8px;border:none;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;cursor:pointer;overflow:hidden}
.bienen-trigger:hover,.bienen-trigger[data-active]{background:var(--dsw-alias-interactive-bg-hover)}
.bienen-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bienen-count{margin-left:auto;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-primary, #fff);font-size:11px;line-height:18px;text-align:center}
.bienen-panel{position:fixed;z-index:40;width:min(360px,calc(100vw - 24px));max-height:min(480px,70vh);display:flex;flex-direction:column;border-radius:12px;background:var(--dsw-alias-bg-primary, #1b1b1b);color:var(--dsw-alias-label-primary);box-shadow:0 8px 32px rgba(0,0,0,.35);overflow:hidden}
.bienen-head,.bienen-foot{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-secondary, #333)}
.bienen-foot{border-bottom:none;border-top:1px solid var(--dsw-alias-border-secondary, #333);margin-top:auto}
.bienen-body{overflow:auto;padding:8px 12px 12px;font-size:13px}
.bienen-error{margin:0 0 8px;color:var(--dsw-alias-label-danger, #e24)}
.bienen-group{margin:12px 0 6px;font-size:12px;opacity:.7}
.bienen-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-secondary, #333)}
.bienen-title{flex:1;min-width:0}
.bienen-ver{opacity:.65;font-size:12px}
.bienen-chip{font-size:11px;opacity:.8}
.bienen-btn{border:none;border-radius:8px;padding:4px 8px;font:inherit;font-size:12px;cursor:pointer;background:var(--dsw-alias-interactive-bg-hover);color:inherit}
.bienen-btn:disabled{opacity:.5;cursor:default}
.bienen-pre{white-space:pre-wrap;font-size:12px;user-select:all}
`

function ensureCss() {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-plugin-css="bienen-market"]')) return
  const tag = document.createElement('style')
  tag.dataset.pluginCss = 'bienen-market'
  tag.textContent = CSS
  document.head.appendChild(tag)
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
    h('span', { 'aria-hidden': true }, '蜂'),
    wide ? h('span', { className: 'bienen-label' }, '小彼恩') : null,
    badge > 0 ? h('span', { className: 'bienen-count' }, String(badge)) : null,
    ),
  )
}

export const inject = ['slots']

export function apply(ctx) {
  ensureCss()
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'bienen-market',
    order: 10,
    label: '小彼恩',
  }, BienenPanel))
}
