# nodejs-sshx 多面板部署教程

支持**翼龙面板**和**DirectAdmin面板**的 Node.js 脚本，一键部署 **sing-box 多协议代理 / VLESS-WS / VMess-WS**，并自动同步到 GitHub Gist。

---

## 两种模式

| 模式 | 面板 | 依赖 |
|------|------|------|
| **完整模式** | 翼龙面板 (Pterodactyl) | sing-box, cloudflared 等外部二进制 |
| **DirectAdmin 模式** | DirectAdmin | 仅 Node.js + ws (无需外部二进制) |

---

## DirectAdmin 部署步骤

### 方法一：使用网页面板（推荐）

1. 打开 [参数面板](https://zv201413.github.io/nodejs_sshx/)
2. 勾选底部的 **DirectAdmin 模式**（红色高亮）
3. 填写：
   - 服务器域名 (必填)
   - UUID (可选，留空自动生成)
   - 节点名称前缀
   - 优选 IP/域名 (可选，多个用 ; 分隔)
   - Gist 同步 (可选)
4. 复制生成的命令
5. 将命令粘贴到 `application.properties` 文件

### 方法二：手动配置

1. 将 `directadmin.js`、`package.json`、`application.properties` 三个文件上传到域名的 `public_html` 目录

2. 在 DirectAdmin 后台：**附加功能 → Setup Node.js App**
   - 路径: `public_html`
   - 启动文件: `directadmin.js`

3. 点击 **CREATE APPLICATION**

4. 执行 **Run NPM Install**

5. 启动 **Run JS script**

6. 访问 `你的域名/UUID` 即可查看节点链接

### application.properties 配置示例

```properties
# DirectAdmin 模式配置
paper-domain=你的域名.com
UUID=你的UUID（可选）
paper-name=US
paper-argo-ip=www.visa.com.sg;www.shopify.com（可选，多个用;分隔）
gist-id=你的GistID（可选）
gh-token=你的Token（可选）
```

> [!IMPORTANT]
> **关于域名填写**：`paper-domain` 必须填写**域名**，不能填写 IP 地址。
> - 原因：VLESS-WS + TLS 协议需要 SNI（Server Name Indication）为域名
> - 如果你使用 IPv6 IP 地址，需要将域名 AAAA 记录指向你的 IPv6 地址
> - 示例：`your-domain.com` → AAAA 记录 → `2606:4700:4700::1111`

---

## 翼龙面板部署步骤

1. 在游戏机页面找到 IP 和端口后，打开 [参数面板](https://zv201413.github.io/nodejs_sshx/) 复制命令，粘贴到 `application.properties` 文件

2. 将 `index.js`、`package.json`、`application.properties` 三个文件上传到翼龙面板根目录

3. 启动或重启翼龙面板，程序会自动读取配置

4. 复制节点即可使用，如配置了 Gist 也会自动推送

---

## 翼龙面板参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| `paper-name` | 节点名称前缀（会自动添加国家代码） | `JP`, `US` |
| `paper-argo` | Argo 协议类型 | `vless-ws`, `vmess-ws` |
| `paper-argo-ip` | 优选 IP/域名（多个用;分隔） | `www.visa.com.sg;www.shopify.com` |
| `paper-domain` | 自定义节点地址 | `162.43.31.93` |
| `paper-hy2-port` | Hysteria2 端口 | `25565` |
| `paper-tuic-port` | TUIC 端口 | `25575` |
| `paper-sshx` | 启用 SSHX 网页终端 | `true`, `false` |
| `paper-ttyd` | 启用 ttyd 网页终端 | `true`, `false` |
| `gist-id` | GitHub Gist ID | `b514d...` |
| `gh-token` | GitHub Token | `ghp_xxx` |
| `warp-mode` | WARP 出站模式 | `warp`, `direct`, 空(自动) |
| `warp-data` | WARP WireGuard 配置 | 见下方说明 |

---

## WARP 出站说明

### WARP 模式

| 模式 | 值 | 说明 |
|------|------|------|
| 全局 WARP | `warp` | 所有流量通过 WARP 出站 |
| 直连 | `direct` | 关闭 WARP，所有流量直连 |
| 自动 | 空 | 仅 Netflix/OpenAI 等流量走 WARP，其余直连 |

### warp-data 输入格式

支持以下格式：
- WireGuard INI 配置
- API 文本格式
- 中文标签

---

## 常见问题

**Q: 节点名称如何自动添加国家代码？**
A: 程序会自动调用 IP API 获取国家代码和 ISP 信息

**Q: Gist 同步失败？**
A: 检查 `gist-id` 和 `gh-token` 是否正确

---

MIT - 本项目仅供技术研究与学习使用