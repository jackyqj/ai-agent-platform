#!/usr/bin/env bash
# 3b：从 vendor rc.8 构建「小彼恩dsh」npm 包（字标占位，不注入 DeepSeek official 品牌槽）。
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
# 故意不设 official，避免 ui-brand-official 注入 DeepSeek 商标。
unset DSH_CLIENT_BUILD_PROFILE || true
export DSH_BUILD_CLIENT_PROFILE="${DSH_BUILD_CLIENT_PROFILE:-}"

cd "$DSH"
pnpm install
pnpm run build

mkdir -p "$OUT"
if [[ -f scripts/release/pack.ts ]]; then
  pnpm exec tsx scripts/release/pack.ts --family dsh
fi
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
