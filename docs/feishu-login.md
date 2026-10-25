# 飞书登录配置

将本项目 `.env` 中的 `AUTH_PROVIDER` 设为 `feishu`，即可使用飞书授权登录。此模式不加载 Clerk 登录组件；原有 Clerk 方式仍可通过 `AUTH_PROVIDER=clerk` 使用。

## 飞书应用

1. 在飞书开放平台创建或选择企业自建应用，确保当前用户有使用该应用的权限。
2. 在“凭证与基础信息”获取 App ID 和 App Secret，保存到本机 `.env` 的 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`。不要提交真实凭证。
3. 在“安全设置 → 重定向 URL”追加 `http://localhost:3000/api/auth/feishu/callback`。复用应用时保留其他项目的回调地址。
4. 本项目只获取登录用户的基本身份，不申请消息、文档、手机号、邮箱或离线访问权限。无需为了登录额外开通这些权限。
5. 如企业对应用可用人员或版本发布有审批要求，按企业流程配置并发布。

## 本机环境变量

```dotenv
AUTH_PROVIDER=feishu
AUTH_URL=http://localhost:3000
AUTH_SESSION_SECRET=至少32位的随机字符串
FEISHU_APP_ID=你的应用ID
FEISHU_APP_SECRET=你的应用密钥
FEISHU_USER_BINDINGS={}
```

两台电脑分别维护自己的 `.env`，会话密钥至少使用 32 位随机值。正式部署时把 `AUTH_URL` 改成实际 HTTPS 地址，并在飞书后台追加对应回调；不要使用请求中的 Host 决定 OAuth 回调地址。

## 原有工作区的数据

飞书账号默认使用独立工作区。即使邮箱相同，也不会自动连接到旧用户或其他企业的数据。首次成功登录后，可在数据库 `user` 表看到新建的 `feishu_` 用户 ID。

需要保留原有 Clerk 工作区时，由管理员在本机 `.env` 的 `FEISHU_USER_BINDINGS` 中将这个新用户 ID 明确绑定到已有用户及组织。例如：

```dotenv
FEISHU_USER_BINDINGS={"feishu_新用户ID":{"userId":"已有用户ID","orgId":"已有组织ID","organizationName":"FoloUp"}}
```

此值只在服务器读取，不接受浏览器传入的工作区 ID。配置后重启服务，已有会话也会按新绑定读取原工作区。迁移不删除旧用户、面试、报告或原有组织。

## 使用与排查

- 打开 `/dashboard`，未登录时显示“使用飞书登录”，授权完成后自动进入后台。
- 候选人的 `/call/…` 面试链接继续公开访问，不要求飞书登录。
- 点击后台右上角“退出登录”只退出 FoloUp，不退出其他飞书应用。
- 回调地址错误时，检查协议、域名、端口、路径是否与 `AUTH_URL` 和飞书后台一致。
- 提示登录请求失效时，回到登录页重新发起；授权码不能重复使用。
- 应用禁用、未发布、用户不在可用范围或凭证失效时，需要在飞书后台处理后再登录。

实现使用 OAuth state、S256 PKCE，以及仅供服务器读写的加密 HttpOnly Cookie。飞书令牌只用于当次身份查询，不写入数据库或浏览器会话；登录会话最长 8 小时。

当前按飞书授权码文档的 PKCE 兼容说明，将 v1 授权页与 v2 令牌接口配套使用。切换新令牌版本前需确认授权页已支持对应 PKCE 校验；不可在同一次请求中用相同授权码自动重试另一个端点。

官方资料：[获取授权码](https://open.feishu.cn/document/authentication-management/access-token/obtain-oauth-code)、[获取用户信息](https://open.feishu.cn/document/server-docs/authentication-management/login-state-management/get)。
