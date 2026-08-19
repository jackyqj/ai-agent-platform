# 工作流模板：多源数据报表

- **适用**：跨数据源/跨部门的汇总报表（销售、运营、财务等维度）
- **触发**：`用多源报表模板，出 XX 的汇总报表`

## 执行方式（模型侧）

先 `list_tables` 确认可查表，再用 `workflow` 并行执行各源查询：

```js
const queries = [
  '用 query_readonly 查各区域销售总额',
  '用 query_readonly 查各产品类目销量',
]
const results = await parallel(queries.map(q => () => agent(q)))
return { value: results.join('\n\n') }
```

## 输出要求

合并成一张汇总报告：每个来源一节（含查询口径与行数）、交叉对比（如区域×类目）、显著波动提示。
