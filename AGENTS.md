# 仓库协作指引

## 适用范围与代码归属

- 本指引适用于整个仓库。修改 `dsh-source/` 时，还须遵循其中的 [AGENTS.md](dsh-source/AGENTS.md)。
- 修改 `dsh-source/` 前，先阅读 [deps/README.md](deps/README.md)。保留其中的平台自有组件；更新上游代码时遵循文档所述的 vendor 同步流程。
- 优先在平台服务和集成层实现平台行为；仅在任务确有需要时修改 DSH 内部实现。
- 将授权、审批、数据路由和密钥处理视为服务端控制。保持默认拒绝；不得在日志、响应、测试夹具或文档中暴露密钥明文。

## 开发与验证

- 修改前先检查相关实现、测试和配置。沿用现有模式，变更范围限于任务要求。
- 修改数据库结构时，在 `apps/control-plane/migrations/` 新增或更新迁移；保留现有数据，并验证迁移流程。
- 使用受影响软件包 `package.json` 中的脚本，运行范围最小且相关的测试或构建。为行为变更加有针对性的测试，并说明未运行的检查。
- 同步更新描述了该行为的文档。以代码核实当前行为；带日期的状态记录仅作快照，不作为事实依据。
- 已实施或已批准的架构变更若影响系统边界、组件职责、关键请求/数据流或部署形态，须在同一变更中更新 [docs/system-arch42.md](docs/system-arch42.md)。以代码及最新 [docs/map.md](docs/map.md)、[docs/spec.md](docs/spec.md) 决策校准文档；图文须一致，未实施的方案须明确标为设计或待定。员工主路径当前采用 D22 逻辑 RPC 会话与 JSON-RPC 运行时池；只有该架构发生变化时，才相应调整文档中的会话与运行时视图。

## 项目资料

- 本地环境、启动和端到端开发流程：[docs/RUN-LOCALLY.md](docs/RUN-LOCALLY.md)。
- 若变更涉及系统边界或既定决策，查阅 [docs/spec.md](docs/spec.md)、[docs/enterprise-shell.md](docs/enterprise-shell.md) 和 [docs/map.md](docs/map.md)。
- 任务指定或实现某个 issue 时，阅读 [docs/issues/](docs/issues/) 中对应的需求与验收标准。
- 进度快照见 [docs/STATUS.md](docs/STATUS.md)；引用其中状态前，先核对实现和测试。
- DSH 工作区约束与平台自有组件说明：[deps/README.md](deps/README.md)。

## UI 与图表

- 开发 UI 时，使用 `frontend-design` skill，并遵循现有 UI 实现模式。
- 处理图表需求时，遵循 [.github/instructions/mermaid.instructions.md](.github/instructions/mermaid.instructions.md)，包括语法校验和预览。
