# FoloUp 双机协作约定

- 用户使用两台电脑共同开发此项目，本机是其中一台。GitHub 仓库为 `https://github.com/LinYiXin123/foloup`，`origin` 必须指向这个仓库；`upstream` 是原始开源项目，不能误推送过去。
- 用户已长期授权：开始开发前主动检查并同步远程更新；完成本次代码修改或相关文档维护、通过适当验证后，自动提交并推送，无需每次确认。只读咨询不创建空提交。
- 开始任务时先检查工作区、当前分支和远程地址，再执行 `git fetch origin` 比较本地与远程。工作区干净且仅落后时，使用快进方式更新；不要凭旧的远程跟踪信息判断已同步。
- 有未提交改动时先确认归属并保留，不能覆盖其他会话或用户未完成的工作。两台电脑的提交发生分叉时，保留双方提交，正常合并并验证；可根据代码判断的冲突自行解决，业务意图无法判断时再询问用户。
- 提交只包含当前任务相关内容。推送前再次检查远程变化、实际差异和验证结果，推送到当前任务分支；远程前进导致推送被拒绝时，拉取并整合后再正常推送。禁止强制推送、覆盖他人提交、擅自执行 `reset --hard` 或 `clean` 丢弃工作。
- Git 提交作者和提交者均使用姓名 `林艺新`、邮箱 `175513640+LinYiXin123@users.noreply.github.com`。使用已经验证的本机 Git 推送渠道，不使用身份不匹配的连接器写入。
- 用简体中文沟通，提交标题使用“中文类型：具体变化”。类型采用新增、优化、修复、文档、测试、重构、维护、性能、样式、构建、回退。提交正文写明改了什么、用户能看到的变化和验证结果。
- 按改动范围执行现有测试、类型检查和相关文件检查；仅文档改动检查差异和内容即可。代码改动可使用 `node --test tests/*.test.cjs`、`node node_modules/typescript/bin/tsc --noEmit --incremental false` 和改动文件的 Biome 检查。
- 不提交真实环境变量、密钥、个人简历、录音、测试私有数据、依赖或缓存。`.env`、`.local/`、`node_modules/`、`.next/` 留在各自电脑；依赖、包管理器缓存和构建产物优先放各自电脑的项目所在非系统盘，尽量不占用 C 盘，不在共享配置中硬编码本机绝对路径。
- 推送后核对远程提交号，确认本地与远程一致。完成时说明实际变化、验证结果、推送状态，并提供提交链接；网络或权限导致同步失败时如实说明，不声称已同步。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
