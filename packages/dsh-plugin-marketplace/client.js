window.__ModuleLoader__.load({ id: "@bienen/dsh-plugin-marketplace", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  BienenPanel: () => BienenPanel,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");

// src/panel-model.js
var STATE_LABEL = {
  missing: "\u672A\u5E94\u7528",
  current: "\u5DF2\u5E94\u7528",
  update: "\u53EF\u66F4\u65B0",
  conflict: "\u51B2\u7A81"
};
function badgeCount(snapshot) {
  const rows = [...snapshot.skills ?? [], ...snapshot.agents ?? []];
  return rows.filter((row) => row.state === "missing" || row.state === "update").length;
}
function loginCommand(serverUrl) {
  const server = serverUrl && serverUrl.trim() !== "" ? serverUrl : "<\u63A7\u5236\u9762URL>/api";
  return `dsh-biene login --server ${server} --token <JWT>`;
}
function rowAction(state) {
  if (state === "missing") return "apply";
  if (state === "update") return "update";
  return null;
}
function stateLabel(state) {
  return STATE_LABEL[state] ?? state;
}

// src/client/index.js
var XB_MARK = "#ef5b2b";
var CSS = `
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
`;
function ensureCss() {
  if (typeof document === "undefined") return;
  let tag = document.querySelector('style[data-plugin-css="bienen-market"]');
  if (tag === null) {
    tag = document.createElement("style");
    tag.dataset.pluginCss = "bienen-market";
    document.head.appendChild(tag);
  }
  tag.textContent = CSS;
}
async function readStatus() {
  const res = await fetch("/bienen/status");
  return res.json();
}
async function postApply(body) {
  const res = await fetch("/bienen/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  return res.json();
}
function versionLine(row) {
  return `${row.localVersion ?? "\u2014"} \u2192 ${row.remoteVersion}`;
}
function CatalogSection({ title, rows, empty, busy, onApply }) {
  return (0, import_react.createElement)(
    "section",
    null,
    (0, import_react.createElement)("h3", { className: "bienen-group" }, title),
    rows.length === 0 ? (0, import_react.createElement)("p", null, empty) : rows.map((row) => {
      const action = rowAction(row.state);
      const key = row.slug ?? row.id;
      return (0, import_react.createElement)(
        "div",
        { key, className: "bienen-row", "data-bienen-row": key, "data-state": row.state },
        (0, import_react.createElement)("div", { className: "bienen-title" }, row.title ?? key),
        (0, import_react.createElement)("span", { className: "bienen-ver" }, versionLine(row)),
        (0, import_react.createElement)("span", { className: "bienen-chip" }, stateLabel(row.state)),
        action === null ? row.state === "conflict" ? (0, import_react.createElement)("span", { className: "bienen-ver" }, "\u7EC8\u7AEF dsh-biene sync --force") : null : (0, import_react.createElement)("button", {
          type: "button",
          className: "bienen-btn",
          disabled: busy,
          onClick: () => {
            void onApply(row.slug ? { skill: row.slug } : { agent: row.id });
          }
        }, action === "update" ? "\u66F4\u65B0" : "\u5E94\u7528")
      );
    })
  );
}
function BienenPanel({ wide }) {
  const rootRef = (0, import_react.useRef)(null);
  const [open, setOpen] = (0, import_react.useState)(false);
  const [anchor, setAnchor] = (0, import_react.useState)(void 0);
  const [snap, setSnap] = (0, import_react.useState)(null);
  const [busy, setBusy] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    ensureCss();
  }, []);
  (0, import_react.useEffect)(() => {
    void readStatus().then(setSnap);
  }, []);
  (0, import_react.useLayoutEffect)(() => {
    if (!open) return;
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect) setAnchor({ left: rect.left, bottom: window.innerHeight - rect.top + 8 });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);
  (0, import_react.useEffect)(() => {
    if (!open) return;
    const onDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  const badge = snap ? badgeCount(snap) : 0;
  const signedOut = snap?.loggedIn === false;
  const runApply = async (body) => {
    setBusy(true);
    try {
      setSnap(await postApply(body));
    } finally {
      setBusy(false);
    }
  };
  return (0, import_react.createElement)(
    "div",
    { ref: rootRef, className: "bienen-layer" },
    open && anchor ? (0, import_react.createElement)(
      "section",
      {
        className: "bienen-panel",
        style: { left: anchor.left, bottom: anchor.bottom },
        "data-bienen-panel": "",
        "aria-label": "\u5C0F\u5F7C\u6069"
      },
      (0, import_react.createElement)("header", { className: "bienen-head" }, (0, import_react.createElement)("strong", null, "\u5C0F\u5F7C\u6069")),
      (0, import_react.createElement)(
        "div",
        { className: "bienen-body" },
        snap?.error && !signedOut ? (0, import_react.createElement)("p", { className: "bienen-error", role: "alert" }, snap.error.message) : null,
        signedOut ? (0, import_react.createElement)(
          "div",
          null,
          (0, import_react.createElement)("p", null, "\u672A\u767B\u5F55\u3002\u5728\u7EC8\u7AEF\u8FD0\u884C\uFF1A"),
          (0, import_react.createElement)("pre", { className: "bienen-pre" }, loginCommand(snap.serverUrl))
        ) : (0, import_react.createElement)(
          "div",
          null,
          (0, import_react.createElement)(CatalogSection, {
            title: "Skill",
            rows: snap?.skills ?? [],
            empty: "\u6CA1\u6709\u53EF\u89C1\u7684\u5DF2\u53D1\u5E03\u9879",
            busy,
            onApply: runApply
          }),
          (0, import_react.createElement)(CatalogSection, {
            title: "Agent",
            rows: snap?.agents ?? [],
            empty: "\u6CA1\u6709\u53EF\u89C1\u7684\u5DF2\u53D1\u5E03\u9879",
            busy,
            onApply: runApply
          })
        )
      ),
      signedOut ? null : (0, import_react.createElement)(
        "div",
        { className: "bienen-foot" },
        (0, import_react.createElement)("button", {
          type: "button",
          className: "bienen-btn",
          disabled: busy,
          onClick: () => {
            void readStatus().then(setSnap);
          }
        }, "\u5237\u65B0"),
        (0, import_react.createElement)("button", {
          type: "button",
          className: "bienen-btn",
          disabled: busy,
          onClick: () => {
            void runApply({});
          }
        }, "\u5168\u90E8\u5E94\u7528")
      )
    ) : null,
    (0, import_react.createElement)(
      "button",
      {
        type: "button",
        className: "bienen-trigger",
        "data-active": open || void 0,
        "aria-label": "\u5C0F\u5F7C\u6069",
        "aria-expanded": open,
        onClick: () => {
          setOpen((v) => !v);
        }
      },
      (0, import_react.createElement)("span", { className: "bienen-dotn", "aria-hidden": true }, "\u5F7C"),
      wide ? (0, import_react.createElement)("span", { className: "bienen-label" }, "\u5C0F\u5F7C\u6069") : null,
      badge > 0 ? (0, import_react.createElement)("span", { className: "bienen-count" }, String(badge)) : null
    )
  );
}
function XiaobienMark({ size = 24 }) {
  const edge = typeof size === "number" ? size : 24;
  return (0, import_react.createElement)("span", {
    className: "bienen-mark",
    style: { width: edge, height: edge, fontSize: Math.round(edge * 0.52) },
    "aria-hidden": true
  }, "\u5F7C");
}
function XiaobienName() {
  return (0, import_react.createElement)("span", { className: "bienen-name" }, "\u5C0F\u5F7C\u6069dsh");
}
var inject = ["slots"];
function apply(ctx) {
  ensureCss();
  if (typeof document !== "undefined" && document.title !== "\u5C0F\u5F7C\u6069dsh") {
    document.title = "\u5C0F\u5F7C\u6069dsh";
  }
  ctx.slots.inject("sidebar.brand.mark", () => ctx.slots.inject("sidebar.brand.name", function* () {
    yield ctx.slots.register({ name: "sidebar.brand.mark", priority: 20 }, XiaobienMark);
    yield ctx.slots.register({ name: "sidebar.brand.name", priority: 20 }, XiaobienName);
  }));
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: "bienen-market",
    order: 10,
    label: "\u5C0F\u5F7C\u6069"
  }, BienenPanel));
}
return module.exports; } });
