# 公网分享与部署

`http://localhost:3000/call/…` 只能在运行项目的电脑上打开。把代码推到 GitHub 不会自动部署网站；仅把 `.env` 中的地址改成某个域名，也不会让这个域名连接到应用。

## 选择访问方式

- 正式邀请候选人：将应用部署到持续运行的服务器或支持 Next.js 服务端的托管平台，绑定固定 HTTPS 网址。电脑关机后，部署的应用仍可继续提供服务。
- 临时测试：用 HTTPS 隧道连接本机服务。电脑、服务和隧道都必须保持运行；临时网址可能在重新启动隧道后变化，不适合长期发送给候选人。

浏览器在公网访问麦克风需要安全上下文，请使用 HTTPS。候选人进入 `/call/…` 无需飞书账号；面试管理和报告仍需要管理员登录。

## 网址配置

假设已经准备好的公网网址为 `https://interviews.example.com`，在实际部署环境中设置：

```dotenv
# 候选人链接的固定地址，也可以留空跟随当前访问地址
NEXT_PUBLIC_LIVE_URL=https://interviews.example.com
# 飞书管理员登录的固定地址
AUTH_URL=https://interviews.example.com
NEXT_PUBLIC_SITE_URL=https://interviews.example.com
```

在飞书应用“安全设置 → 重定向 URL”追加 `https://interviews.example.com/api/auth/feishu/callback`，保留本机和其他项目已使用的回调。服务器分别保存登录、Supabase、Retell 和模型接口所需的真实环境变量及原有工作区绑定；这些值不要写进 Git。

`NEXT_PUBLIC_` 变量在构建时写入浏览器代码，修改后需要重新构建、部署。本机开发时可以保留 `AUTH_URL=http://localhost:3000`，不要为了临时候选人测试而随意改动管理员登录回调。

分享和预览会使用已配置的公网地址；未配置时使用当前访问网址。若配置仍为 `localhost`，通过公网网址访问时会跟随当前公网地址。历史面试中保存的旧本机地址不会继续决定分享链接，无需重建面试。

## Node.js 服务器部署

项目使用服务端登录、数据库访问和 PDF 解析，需部署完整的 Node.js 应用，不能只上传静态 HTML 到 GitHub Pages。

在服务器配置环境变量、安装锁定依赖后执行：

```sh
yarn install --frozen-lockfile
yarn build
yarn start --hostname 127.0.0.1 --port 3000
```

通过服务器进程管理工具保持应用运行，并在前面配置 HTTPS 反向代理。选择与项目依赖兼容的 Node.js 版本，部署前检查构建和运行日志。

## 外部访问验收

1. 使用手机流量或另一台外网电脑打开候选人链接，确认域名是实际公网网址。
2. 检查面试已启用，且没有被移至回收站；如限制受邀邮箱，使用列表内的邮箱。
3. 确认可以上传 PDF、允许麦克风并进入面试；发起语音面试会消耗 Retell 额度。
4. 用管理员账号登录后台查看回答及中文报告，检查刷新后记录仍然存在。
5. 未登录访问后台和报告应要求登录，不能看到候选人的简历、录音或报告。

尚未部署或开通隧道时，本机链接会显示用途提示；这不代表已经具备公网访问能力。

参考：[Next.js 部署](https://nextjs.org/docs/app/getting-started/deploying)、[Next.js 自托管](https://nextjs.org/docs/app/guides/self-hosting)、[Cloudflare 临时隧道](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)。
