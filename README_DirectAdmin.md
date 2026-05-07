# DirectAdmin 面板部署教程

在 DirectAdmin 面板上一键部署 **VLESS-WS** 节点，自动同步到 GitHub Gist。

---

## 部署步骤

### 阶段一：使用网页面板（推荐）

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

### 阶段二：上传文件

1. 将 `directadmin.js`、`package.json`、`application.properties` 上传到域名的 `public_html` 目录

2. 在 DirectAdmin 后台：**附加功能 → Setup Node.js App**
   - 路径: `public_html`
   - 启动文件: `directadmin.js`

3. 点击 **CREATE APPLICATION**，执行 **Run NPM Install**，启动 **Run JS script**
执行 **Run NPM Install**出现以下错误可忽略
<img width="612" height="321" alt="26-05-06-08-16-08" src="https://github.com/user-attachments/assets/2dbd2c3a-2fd9-4252-8a1e-2f0d67f52a5a" />
启动 **Run JS script**出现以下现象即可
<img width="1070" height="698" alt="26-05-06-08-16-29" src="https://github.com/user-attachments/assets/53e6f30f-7d1f-43bb-9900-d96398d31ad9" />

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
<img width="772" height="52" alt="image" src="https://github.com/user-attachments/assets/9a26594f-7e14-412a-93db-7149041626ae" />

生成 x 个节点，分别使用不同的优选地址。

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

### 自动保活

程序会**自动守护 ttyd 进程**，每 5 分钟检查一次，如进程缺失会自动拉起。

---

## 节点保活

DirectAdmin 面板长时间无访问会进入休眠状态。程序内置**自动保活机制**：

- 首次启动后 **1 分钟** 开始首次保活
- 之后每 **5 分钟 + 随机 0-5 分钟**（即 5-10 分钟随机间隔）
- 访问 `https://你的域名/UUID` 页面，防止面板休眠

日志中会显示 `[保活] 已访问节点页面, 状态码: 200`

---

## 进阶技巧

### 重新创建nodejs.app之前可以在web ssh运行以下命令

```bash
pkill -9 -u $USER -f "node directadmin.js|node index.js|lsnode" || echo "没有发现运行中的相关进程"
```

## ⚠️ 注意事项

- **多路复用 (Mux)**：DirectAdmin 模式下务必关闭代理软件的 Mux 功能，否则节点无法连接


---
## 鸣谢
[DirectAdmin-Vless-ws-tls](https://github.com/eishare/DirectAdmin-Vless-ws-tls)