const STATE_LABEL = {
  missing: '未应用',
  current: '已应用',
  update: '可更新',
  conflict: '冲突',
}

export function badgeCount(snapshot) {
  const rows = [...(snapshot.skills ?? []), ...(snapshot.agents ?? [])]
  return rows.filter((row) => row.state === 'missing' || row.state === 'update').length
}

export function loginCommand(serverUrl) {
  const server = serverUrl && serverUrl.trim() !== '' ? serverUrl : '<控制面URL>/api'
  return `dsh-biene login --server ${server} --token <JWT>`
}

export function rowAction(state) {
  if (state === 'missing') return 'apply'
  if (state === 'update') return 'update'
  return null
}

export function stateLabel(state) {
  return STATE_LABEL[state] ?? state
}
