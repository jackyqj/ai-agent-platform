export function fmtTs(v?: string): string {
  return String(v ?? '').replace('T', ' ').slice(0, 19);
}

export function localToIso(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function shortId(id: string, n = 8): string {
  return id.length > n ? id.slice(0, n) + '…' : id;
}
