#!/usr/bin/env bash
# 3b：从 vendor 0.1.3-alpha.1 构建「小彼恩dsh」npm 包（字标占位，不注入 DeepSeek official 品牌槽）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DSH="$ROOT/dsh-source"
ASSETS="$ROOT/packages/dsh-brand/assets"
OUT="$ROOT/dist/bienen-dsh"
FAV="$DSH/apps/web/public/favicon.svg"
MAN="$DSH/apps/web/public/manifest.webmanifest"

if [[ ! -d "$DSH" ]]; then
  echo "missing dsh-source" >&2
  exit 1
fi

backup() {
  local f="$1"
  if [[ -f "$f" && ! -f "$f.bienen-bak" ]]; then
    cp "$f" "$f.bienen-bak"
  fi
}

restore() {
  local f="$1"
  if [[ -f "$f.bienen-bak" ]]; then
    mv "$f.bienen-bak" "$f"
  fi
}

backup "$FAV"
backup "$MAN"
cp "$ASSETS/favicon.svg" "$FAV"
cp "$ASSETS/manifest.webmanifest" "$MAN"

cleanup() { restore "$FAV"; restore "$MAN"; }
trap cleanup EXIT

export DSH_CLIENT_TITLE="${DSH_CLIENT_TITLE:-小彼恩dsh}"
# dsh build.ts 把 DSH_BUILD_CLIENT_PROFILE 的空字符串当成未知 profile。
# 必须整项 unset：未设置 → 继承 DSH_CLIENT_TITLE；official → DeepSeek 鱼标。
unset DSH_CLIENT_BUILD_PROFILE DSH_BUILD_CLIENT_PROFILE || true

cd "$DSH"
pnpm install
pnpm run build

mkdir -p "$OUT"
# pack.ts --family dsh 会强制官方标题「DeepSeek Harness」，品牌包走自己的打包。
pnpm exec tsx "$ROOT/scripts/pack-bienen-dsh.ts" --out dist/npm
shopt -s nullglob
copied=()
if [[ -d dist/npm ]]; then
  for tgz in dist/npm/*.tgz; do
    cp "$tgz" "$OUT/"
    copied+=("$tgz")
  done
fi
if [[ ${#copied[@]} -eq 0 ]]; then
  echo "no npm tarball produced under $DSH/dist/npm" >&2
  exit 1
fi

echo "Branded artifacts under $OUT"
echo "Install: npm i -g $OUT/<dsh tgz>   then: dsh web"
echo "Title should read: $DSH_CLIENT_TITLE"
