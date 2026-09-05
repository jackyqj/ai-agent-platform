# 小彼恩 dsh 品牌构建（工单 24 阶段 3b）

用 vendor `dsh-source`（0.1.0-rc.8）做安装包。不启用 `DSH_CLIENT_BUILD_PROFILE=official`，因此不会注入 DeepSeek 鱼标；标题走 `DSH_CLIENT_TITLE=小彼恩dsh`。正式 logo 到位后替换 `assets/favicon.svg`。

```sh
./scripts/build-bienen-dsh.sh
# 产物：dist/bienen-dsh/*.tgz
# 同事：npm i -g ./dist/bienen-dsh/deepseek-ai-dsh-*.tgz
# 或 npx 指向该 tgz。标题为「小彼恩dsh」。
```
