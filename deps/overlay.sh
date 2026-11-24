#!/usr/bin/env bash
# Vendor overlay recipe. Run from the platform repo after a dsh-source subtree pull.
# Regenerates the lockfile and tsconfig.base.json generated region. Does not
# hand-edit upstream files.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/dsh-source"

if ! command -v pnpm >/dev/null; then
  echo "overlay: pnpm is required (upstream pin is in dsh-source/package.json packageManager)" >&2
  exit 1
fi

pnpm install
pnpm run gen-tsconfig-paths
