# 工作流模板：周报汇总

- **适用**：团队/项目周报；多模块进展收集后统一汇总
- **触发**：`用周报模板，把 XX 项目这周的进展汇总成周报`

## 执行方式（模型侧）

用 `workflow` 工具写编排脚本，对每个模块并行 `agent()`：

```js
const mods = ['前端', '后端', '数据', '平台']
const results = await parallel(mods.map(m => () => agent(`简要汇报 ${m} 模块本周进展（3 条要点）和风险（1 条）`)))
return { value: '## 本周进展\n' + results.map((r, i) => `### ${mods[i]}\n${r}`).join('\n') + '\n## 风险\n' + results.map((r, i) => r.includes('风险') ? `- ${mods[i]}: ${r}` : '').filter(Boolean).join('\n') }
```

## 输出要求

Markdown 周报：按模块分节（进展要点 + 风险）、汇总一句整体判断；标注数据/信息的时间口径。
