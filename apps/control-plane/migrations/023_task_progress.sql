-- 023：任务进度（对话问询通道）
-- Worker 把 DSH ask_user_question 挂在 running 任务上；商店轮询 GET /tasks/:id 渲染问询卡，
-- POST /tasks/:id/inquiry 写入作答。不落密钥。

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress jsonb;
