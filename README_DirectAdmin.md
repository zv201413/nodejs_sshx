# DirectAdmin 部署教程

支持 **VLESS-WS** 节点部署，仅需 Node.js + ws，无需外部二进制。

---

## 部署步骤

### 方法一：使用网页面板（推荐）

1. 打开 [参数面板](https://zv201413.github.io/nodejs_sshx/)
2. 勾选底部的 **DirectAdmin 模式**（红色高亮）
3. 填写配置：
   - 服务器域名 (必填)
   - UUID (可选，留空自动生成)
   - 节点名称前缀
   - 优选 IP/域名 (可选)
   - Gist 同步 (可选)
   - ttyd 终端凭证 (可选)
4. 复制生成的命令
5. 将命令粘贴到 `application.properties` 文件

### 方法二：手动配置

1. 将 `directadmin.js`、`package.json`、`application.properties` 上传到域名的 `public_html` 目录

2. 在 DirectAdmin 后台：**附加功能 → Setup Node.js App**
   - 路径: `public_html`
   - 启动文件: `directadmin.js`

3. 点击 **CREATE APPLICATION**，执行 **Run NPM Install**，启动 **Run JS script**

4. 访问 `你的域名/UUID` 查看节点链接

---

## 配置参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| `paper-domain` | 服务器域名 | `your-domain.com` |
| `UUID` | 节点 UUID | `845cf12f-...` |
| `paper-name` | 节点名称前缀 | `US` |
| `paper-argo-ip` | 优选 IP/域名 | 见下方说明 |
| `gist-id` | GitHub Gist ID | `b514d...` |
| `gh-token` | GitHub Token | `ghp_xxx` |

---

## 优选 IP/域名

支持多个优选 IP/域名，用 `;` 分隔，程序会为每个生成独立节点。

**示例：**
```
paper-argo-ip=104.17.161.169;www.visa.com.sg;www.shopify.com
```
生成 3 个节点，分别使用不同的优选地址。

---

## ttyd 网页终端

### 启用方法

1. 前端勾选 DirectAdmin 模式后，出现 **ttyd 终端凭证** 输入框
2. 填写格式：`端口:用户名:密码`（如 `7879:admin:123456`）
3. 生成配置会自动包含 `paper-ttyd=true` 和 `ttyd-credential`

### 二进制文件

- 程序启动时**自动从 GitHub 下载** ttyd 二进制（无需手动上传）
- 若下载失败，手动上传 `ttyd` 文件到 `public_html` 目录

### 访问终端

```
https://你的域名:7879
```
输入配置的用户名和密码登录。

---

## 进程管理

### 杀掉所有运行中的进程

```bash
pkill -9 -u $USER -f "node directadmin.js|node index.js|lsnode" || echo "没有发现运行中的相关进程"
```

### 查看运行日志

DirectAdmin 后台 Node.js 应用查看实时日志

---

## ⚠️ 注意事项

- **多路复用 (Mux)**：DirectAdmin 模式下务必关闭代理软件的 Mux 功能，否则节点无法连接
- **WARP 出站**：DirectAdmin 模式不支持 WARP（需要外部二进制）
- **VMess 协议**：DirectAdmin 模式仅支持 VLESS-WS

---

MIT - 本项目仅供技术研究与学习使用