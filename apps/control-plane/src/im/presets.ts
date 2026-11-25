// IM 入口辅助（18 续）：敏感守卫 + 动态帮助文案
// 关键词 → preset 路由已迁至 ImBindingsService（绑定表）；不再硬编码场景表。

export const SENSITIVE_REPLY = `**⚠️ 敏感操作不在 IM 处理**

该操作涉及审批/变更，请到 **Web 平台** 完成（走审批流，全程留痕）。IM 入口只支持查询与问答类任务。`

/** 敏感操作守卫：IM 只允许"问/查"，敏感操作引导到 Web（配合 14 审批）
 *  不用 \b：JS 词边界只认 ASCII \w，中文开头会漏检（如「删除所有」）→ 直接关键词匹配；
 *  分层：硬性动词（破坏/越权类）无条件拒绝；歧义动词（付款/修改/转账）在"咨询语境"
 *  （含 流程/制度/如何/怎么 等词）放行，否则拒绝——宁可保守，不可漏放。 */
export function isSensitive(text: string): boolean {
  const hard = /删除|清空|停用|禁用|注销|重置|批量|批准|通过审批/.test(text)
  if (hard) return true
  const ambiguous = /转账|付款|修改/.test(text)
  if (ambiguous && !/流程|制度|如何|怎么|是什么|规则|规定|要求|办法|指南/.test(text)) return true
  return false
}

/** 解析「切换 <Agent名或id>」；命中返回目标 query，否则 undefined */
export function parseSwitchCommand(text: string): string | undefined {
  const m = text.match(/^切换\s+(.+)$/u)
  const q = m?.[1]?.trim()
  return q || undefined
}

export function buildHelpText(
  agents: Array<{ id: string; name: string; keywords: string[] }>,
): string {
  if (agents.length === 0) {
    return `**🤖 AI Agent 平台助手**

当前没有已开通钉钉入口的 Agent。请管理员在门户对已发布 Agent 点击「开通钉钉入口」。

**限制**：涉及审批、删除、付款等敏感操作请到 Web 平台处理。`
  }
  const lines = agents.map((a) => {
    const kws = a.keywords.length ? a.keywords.slice(0, 5).join('、') : '（无关键词，单入口时默认路由）'
    return `- **${a.name}**（\`${a.id}\`）：${kws}`
  })
  return `**🤖 AI Agent 平台助手**

直接 @我并提问即可。已开通入口：

${lines.join('\n')}

多入口时请带上关键词，或发送「切换 <Agent名或id>」指定技能。

**限制**：涉及审批、删除、付款等敏感操作请到 Web 平台处理。输入「帮助」查看本菜单。`
}

export function buildAmbiguousText(
  agents: Array<{ id: string; name: string; keywords: string[] }>,
): string {
  return `**请指定 Agent**

当前开通了多个钉钉入口，未能从内容中匹配关键词。请：
- 在问题中带上对应关键词，或
- 发送「切换 <Agent名或id>」后再提问

${buildHelpText(agents)}`
}
