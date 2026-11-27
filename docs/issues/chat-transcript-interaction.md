# 对话区：时间线内的状态与问询

Status: P3 in progress
Type: design
Phase: store ChatView + task-worker + tasks.progress

## 对标

Cursor 对话窗把「正在做什么」和「需要你拍板」都放进时间线，而不是侧栏或弹窗。森米抄交互模型，不抄 IDE 深色壳；视觉仍走珊瑚 / 奶油。

| Cursor | 森米现状 | 改为 |
|---|---|---|
| 时间线 = 产品 | 只有 user/assistant 气泡 | 时间线再收 status / inquiry / approval / notice |
| 当前回合下挂步骤 | 侧栏「运行中」 | 步骤条在该回合里，composer 上方一条 live strip |
| 问询卡：选项 + 提交 | 没有 | 阻塞本回合的问询卡 |
| 审批/权限卡在线程里 | 审批在侧栏 | 审批卡进时间线 |
| textarea；运行中变停止；可排队 | 单行 input | textarea；停止；inquiry 打开时以卡片作答 |

侧栏只留引用、工件、最近对话。不再承担运行态。

## 时间线条目

```ts
type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'status'; phase: 'queued' | 'running' | 'done' | 'error'; label: string; detail?: string }
  | { kind: 'inquiry'; prompt: string; options: { id: string; label: string; hint?: string }[]; selected?: string[]; extra?: string }
  | { kind: 'approval'; approvalId: string; action: string; level: string; status: 'pending' | 'granted' | 'cancelled' }
  | { kind: 'notice'; tone: 'warn' | 'ok'; text: string }
```

问询卡是通道：选项行点选，可附一句补充，提交或跳过。提交后卡收成一行「已选择 · …」，答案进下一轮 task。

## 布局

```
header（标题 / Agent / 回市集）
stream（条目从上到下，问询卡钉在当前回合末）
live strip（正在检索知识库 / 等待你选择方向 / 就绪）
composer（textarea · 发送 | 停止）
rail（引用 / 工件 / 最近）
```

Composer：Enter 发送，Shift+Enter 换行。有未答问询时，主通道是卡片，输入框仍可当「补充说明」或排队下一句。

## 分期

1. **壳**（已落地）：textarea、live strip（空闲「就绪」）、把 `sending` / `awaitingApproval` / `myApprovals` 画进时间线。
2. **状态**（部分）：轮询 `GET /api/tasks/:id` 的 `queued`/`running` 写成「排队中 / 正在处理」。细粒度工具步骤仍待 DSH 事件投影。
3. **问询**（通道已接）：DSH `ask_user_question` → Worker `onUserQuestion` → `tasks.progress` kind=inquiry → 商店问询卡 → `POST /api/tasks/:id/inquiry` → Worker 恢复回合。跳过即 `{ cancelled: true }`。

第 1 期即可把对话区做成 Cursor 那种「状态在帖子里」；第 3 期才是真交互通道。
