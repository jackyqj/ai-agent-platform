# ai-agent-platform

Company-internal Agent platform built around DeepSeek Harness. Terms here name the seams the platform actually owns; implementation paths live in `deps/README.md` and `docs/system-arch42.md`.

## Language

**Vendor overlay**:
The platform-owned extra paths on the DSH prefix, plus the post-pull recipe that regenerates the lockfile and TypeScript path aliases, without hand-editing files that already exist upstream.
_Avoid_: vendor copy, keep-list, splice, overlay patch

**DSH prefix**:
The `dsh-source/` tree that tracks DeepSeek Harness. Extra directories that upstream does not have may sit on it; files that exist upstream may not be hand-edited.
_Avoid_: DSH clone, vendored kernel, submodule

**Capability seam** (能力缝):
A DSH-provided slot where the platform supplies an adapter without changing DSH internals. Session persistence and credentials are the two that already have two adapters.
_Avoid_: kernel fork, internal API, platform service

**Platform adapter**:
A workspace package that fills a capability seam or a platform-only plugin, and lives as an extra directory on the DSH prefix. Ownership is D21, not the npm scope.
_Avoid_: platform component, platform service, `@company` package
