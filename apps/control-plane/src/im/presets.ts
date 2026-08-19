// IM 入口 preset 路由（18 工单）：关键词 → 平台 preset
// 与 D19 试点 4 场景对齐：制度/HR 问答、报销/财务流程、数据查询报表、研发文档检索

export const PRESET_HR = 'hr-assistant'
export const PRESET_REPORT = 'report-builder'
export const PRESET_DOC = 'doc-search'
export const PRESET_DEFAULT = 'assistant'

export const HELP_TEXT = `**🤖 AI Agent 平台助手**

直接 @我并提问即可，例如：
- 「请假的制度是什么？」
- 「报销发票的流程？」
- 「上季度华东区销售额是多少？」
- 「检索研发文档里关于 MCP 的部分」

我会自动路由到对应技能（制度/HR、财务报销、数据报表、研发文档）。

**限制**：涉及审批、删除、付款等敏感操作请到 Web 平台处理。输入「帮助」查看本菜单。`

/** 关键词 → preset 路由（命中即返回；多词时按优先级） */
export function routePreset(text: string): string {
  if (/制度|人事|HR|人力|请假|考勤|年假|福利|招聘|绩效|加班/.test(text)) return PRESET_HR
  if (/报销|发票|财务|差旅|付款|合同|采购|审批流/.test(text)) return PRESET_REPORT
  if (/数据|报表|统计|查询|订单|销售|业绩|分析|库存/.test(text)) return PRESET_REPORT
  if (/文档|研发|代码|技术|架构|检索|接口|API|MCP/.test(text)) return PRESET_DOC
  return PRESET_DEFAULT
}

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

export const SENSITIVE_REPLY = `**⚠️ 敏感操作不在 IM 处理**

该操作涉及审批/变更，请到 **Web 平台** 完成（走审批流，全程留痕）。IM 入口只支持查询与问答类任务。`
