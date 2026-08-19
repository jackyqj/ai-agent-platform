# 工作流模板：跨源信息收集

- **适用**：从多个来源（知识库、数据库、文档）收集信息后整合
- **触发**：`用信息收集模板，汇总 XX 相关信息`

## 执行方式（模型侧）

用 `workflow` 的 `parallel` 对每个来源并行派一个子代理收集，`pipeline` 做清洗→整合：

```js
const sources = ['知识库查制度', '数据库查数据', '文档查规范']
const raw = await parallel(sources.map(s => () => agent(`从${s}收集相关信息，输出要点`)))
return { value: raw.join('\n---\n') }
```

## 输出要求

按主题归并去重、标注来源、冲突处明示差异并提示人工确认。
