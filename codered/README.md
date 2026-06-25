# CodeRed Cloud 网页终端部署

## 文件说明

| 文件 | 说明 |
|------|------|
| `cr-run.sh` | Node.js 启动入口（CodeRed 必需） |
| `package.json` | 依赖声明 |
| `index.js` | 主程序（LITE_MODE = Express + ttyd + cloudflared） |
| `index.html` | Web 状态页（Vue3） |
| `application.properties` | 配置文件 |

## 部署步骤

### 1. 上传文件

用 FinalShell SFTP 连接你的 CodeRed 站点，将所有文件上传到 `www` 目录。

### 2. 安装依赖

在 Dashboard → Deployment 标签页点 **Deploy Production**。部署过程中会自动 `npm install`。

### 3. 配置

有两种配置方式（环境变量优先级更高）：

**方式 A：Dashboard 环境变量**
```
LITE_MODE=true
ENABLE_TTYD=true
ttyd-credential=7681:admin:123456
```

**方式 B：application.properties**
```
LITE_MODE=true
ENABLE_TTYD=true
ttyd-credential=7681:admin:123456
```

### 4. 访问

部署完成后，访问 `https://你的域名.codered.cloud` 查看状态页。

### ttyd 配置说明

| 参数 | 说明 | 示例 |
|------|------|------|
| `ENABLE_TTYD=true` | 启用 ttyd 网页终端 | `true` / `false` |
| `ttyd-credential` | 格式: `端口:用户名:密码` | `7681:ttyd:ttyd123` |
| `ttyd-argo-auth` | Cloudflare 固定隧道 Token（留空=临时隧道） | base64 token |
| `GIST_ID` + `GH_TOKEN` | 可选，同步 Argo 地址到 Gist | — |

### Argo 隧道

- **临时隧道**：`ttyd-argo-auth` 留空，自动分配 `*.trycloudflare.com` 域名
  - ⚠️ 重启后域名变化
- **固定隧道**：填写 `ttyd-argo-auth`（Cloudflare Tunnel Token）
  - 需在 Cloudflare 面板配置 Ingress Rules 指向 `http://localhost:7681`
