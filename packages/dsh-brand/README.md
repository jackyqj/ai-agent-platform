# 小彼恩 dsh 品牌构建（工单 24 阶段 3b）

用 vendor `dsh-source`（0.1.3-alpha.1）做安装包。不设置 `DSH_BUILD_CLIENT_PROFILE`（空字符串会被当成非法 profile），因此不会注入 DeepSeek 鱼标；标题走 `DSH_CLIENT_TITLE=小彼恩dsh`。正式 logo 到位后替换 `assets/favicon.svg`。

```sh
./scripts/build-bienen-dsh.sh
# 产物：dist/bienen-dsh/*.tgz
# 同事：npm i -g ./dist/bienen-dsh/deepseek-ai-dsh-*.tgz
# 或 npx 指向该 tgz。标题为「小彼恩dsh」。
```
