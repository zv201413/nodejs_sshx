# nodejs-sshx 多面板部署教程

## 选择你的面板

| 面板 | 部署文档 | 说明 |
|------|----------|------|
| 🖥️ DirectAdmin | [DirectAdmin 部署教程](README_DirectAdmin.md) | Node.js，ttyd可选 |
| 🐲 翼龙面板 (Pterodactyl) | [翼龙面板部署教程](./README_Pterodactyl.md) | 支持 sing-box、ttyd、SSHX、WARP |

翼龙 / KataBump 推荐下载 [完整部署包](deploy/nodejs-sshx-pterodactyl.zip)，上传并在服务器根目录解压，保留现有 `application.properties`。仅上传 `index.js` 会缺少本地辅助模块；npm install 不会补齐这些项目文件。

---

## 功能对比

| 功能 | DirectAdmin | 翼龙面板 |
|------|-------------|----------|
| VLESS-WS | ✅ | ✅ |
| VMess | ❌ | ✅ |
| WARP 出站 | ❌ | ✅ |
| ttyd 网页终端 | ✅ | ✅ |
| SSHX 网页终端 | ❌ | ✅ |
| 多优选域名 | ✅ | ✅ |
| Hysteria2 P2P 打洞 | ❌ | ✅ |
| Gist 同步 | ✅ | ✅ |
| 探针集成（Komari） | ❌ | ✅ |

## 探针集成

翼龙面板现已原生支持 **Komari** / 哪吒监控探针。在参数面板中填入命令即可，无需额外转换工具。详见 [翼龙面板部署教程 - 探针集成](./README_Pterodactyl.md#探针集成komari--哪吒监控)。

探针命令会自动使用虚拟 HOME，优先 `/www/home`，不可写或与 `/etc/passwd` 匹配时回退到运行目录下的 `komari-home`，避开 CodeRed 等容器用户的 `nologin` shell。环境只注入探针子进程，主程序 HOME 保持原值。

## Hysteria2 P2P 打洞

配置生成器的「协议与端口 → P2P 打洞」**默认关闭**。勾选「启用 P2P 打洞」后填写 **Auth 认证密码**，可同时填写 **Obfs 混淆密码**（Salamander，至少 4 字节；留空不混淆）。Realm 牵线地址留空时使用公共 `realm.hy2.io`，自动生成并保存独立的 Realm 名。复制生成的命令到 `application.properties`，重启翼龙服务后生效；只填写密码不会自动启用。

| install 参数 | 环境变量 | 默认 / 用途 |
|------|------|------|
| `hyp2p-enable` | `ENABLE_HYP2P` | `false`，显式设置 `true` 才启用 |
| `hyp2p-auth` | `HYP2P_AUTH` | 启用时必填，客户端使用相同密码 |
| `hyp2p-obfs` | `HYP2P_OBFS` | 可选，客户端使用相同混淆密码 |
| `hyp2p-rv` | `HYP2P_RV` | 可选，自建 Realm 的完整 URI |

例如（替换示例密码）：

```text
install=hyp2p-enable="true" hyp2p-auth="你的认证密码" hyp2p-obfs="你的混淆密码"
```

自建牵线服务有 TLS 时填 `realm://token@域名/名字`；无 TLS 时填 `realm+http://token@IP:8443/名字`。两端必须使用相同 URI，包括 token 和名字。自建服务器及 Windows 客户端说明可参考 [HYP2P 客户端指南](https://github.com/zv201413/zvps-super/blob/main/docs/hyp2p-client.md)。

启用后自动下载官方 Hysteria2 核心，独立于普通 Hy2 端口与 sing-box / WARP 配置运行；P2P 流量从服务器直接出站。无需服务器公网 IP 或入站端口映射，也无需勾选普通「Hysteria2」协议。核心意外退出后自动重试，日志为 `FILE_PATH/hyp2p.log`，沿用单日志大小上限。初始化失败只报告 P2P 错误，其他组件继续启动。

启动后在服务器终端读取客户端配置（默认运行目录为 `.npm`）：

```bash
cat .npm/p2p/client.example.yaml
cat .npm/p2p/realm_name   # 公共 Realm 模式的固定名字
cat .npm/p2p/cert_sha256 # 原生 Hysteria2 的整证书 SHA256（hex）
```

将 `client.example.yaml` 安全复制到本地，下载 [官方 Hysteria2 客户端](https://github.com/apernet/hysteria/releases/latest)，运行：

```bash
hysteria client -c client.example.yaml
```

本地 SOCKS5 为 `127.0.0.1:1080`，HTTP 代理为 `127.0.0.1:8080`。示例包含 Auth / Obfs、Realm URI 和证书指纹；`insecure: true` 配合 `pinSHA256` 校验自签整证书。这里的 hex 指纹与普通 sing-box 节点的 base64 公钥 pin 不同。P2P 配置不加入普通 `/sub` 订阅、sing-box 客户端配置或 Gist，请使用官方 Hysteria2 客户端。

`FILE_PATH/p2p` 保存 Realm 名、证书、私钥和客户端配置，重启只更新核心及日志，保留这些凭据；首次签发证书需要 OpenSSL ≥1.1.1。无持久盘的平台重建后需重新取得客户端配置。公共 Realm 的可用性、UDP 出站限制和两端 NAT 类型会影响打洞成功率。

## 浏览器保存探针与 Gist 凭据

[配置生成器](https://zv201413.github.io/nodejs_sshx/) 的「附加探针」支持以备注保存完整安装命令，「GitHub Gist 同步」支持保存 Gist ID 与 Token。填写后点击「保存 / 更新到浏览器」，若浏览器出现密码提示，请确认；下次点击「填入已存凭据」选择对应记录，配置命令会立即更新。探针安装命令可切换显示，GitHub Token 默认遮挡。

更新旧内容时，先填入已存凭据，保持探针备注或 Gist ID 不变，修改安装命令或 Token 后保存；旧探针记录没有 `[探针]` 前缀时也会保留原账号标识。也可先填写新内容，再点击「更新已存凭据」选择对应旧记录，选择过程不会把编辑框中的新内容替换成旧内容。改变备注或 Gist ID 会作为另一个账号保存。

`store()` 返回只表示浏览器收到请求，无法证明密码管理器已写入。提交后可点击「核对保存结果」选择同一记录，页面会比较已存内容和当前填写内容，不会覆盖编辑框；若仍是旧内容，请确认地址栏密码图标中的更新提示，或在浏览器密码管理器中手动编辑对应记录。

凭据保存在浏览器密码管理器中，页面不把安装命令或 Token 写入 localStorage。保存与回填按钮需要通过 HTTPS 或 localhost 打开页面，并使用支持 PasswordCredential 的浏览器（如 Chrome）；探针和 Gist 记录分别保存，重置页面不会删除已保存凭据。

## 日志大小与重启清理

配置生成器的「连接与节点 → 安装设置」提供**单个日志上限（MB）**，默认 **50**，可填 **1–1024**。生成的 `log-max-mb="50"` 参数也可通过环境变量 `LOG_MAX_MB` 设置。应用日志、Argo、ttyd 和 SSHX 的运行输出按写入大小限制；达到上限时清理旧内容，继续记录。已有运行日志每 10 秒检查一次。订阅、UUID、证书和配置文件不参与日志清理；面板自行收集的控制台日志仍由面板管理。

翼龙模式的组件文件登记在运行目录下的 `.runtime-files.json`。每次重启会先停止并删除上一轮登记的随机名称组件和相关日志，再下载本轮组件；中断的下载也会登记。旧版本遗留的六位随机文件按 sing-box、cloudflared、哪吒和 ttyd 的内容特征识别清理，其他文件保留。

页面上方集中放置协议与连接设置，下方「配置与部署」通过 **Gist 同步 / 附加探针 / 运行设置**页签切换配置，右侧实时生成命令；WARP 与终端凭证位于「运行设置」。

部署更新时，翼龙模式需同时上传 `index.js`、`hyp2p.js`、`log-limit.js`、`runtime-files.js`、`tls-cert.js`、`tls-links.js`、`package.json` 和 `application.properties`；DirectAdmin 模式需上传 `directadmin.js`、`log-limit.js`、`package.json` 和 `application.properties`。

## 自签证书校验与 iOS 兼容订阅

Hysteria2、TUIC、AnyTLS 默认生成带 `pinSHA256` 的校验版节点，公钥 SHA256 使用标准 base64 并正确 URL 编码；默认链接关闭跳过验证。首次生成独立的 ECC P-256 自签证书，SAN 包含 `www.bing.com` 和 `bing.com`，后续启动复用证书和私钥。旧证书缺少 SAN 或即将过期时保留私钥重新签发，公钥 pin 保持不变，使用 PEM 或整证书指纹的客户端需更新证书；旧版内置的共用私钥会一次性替换，需要重新导入节点。首次生成或重新签发需要 **OpenSSL ≥1.1.1**，失败时中止核心启动并报告错误。

默认订阅地址（自定义 `SUB_PATH` 时替换 `sub` 前缀）：

| 地址 | 内容 / 用途 |
|------|-------------|
| `/sub` | 默认校验版订阅，电脑端使用 |
| `/sub-ios` | 独立 iOS 兼容版，Hy2 / TUIC / AnyTLS 跳过证书校验 |
| `/sub-cert.pem` | 下载当前公开 PEM 证书，供客户端手动导入 |
| `/sub-singbox.json` | Hy2 / TUIC / AnyTLS 的 sing-box 客户端配置，使用公钥 pin，混合代理监听 `127.0.0.1:1080` |

Gist 同时推送校验版与 iOS 版；例如 `sub_节点.txt` 和 `sub_节点-ios.txt`，启用 TLS 时另附 `sub_节点-cert.pem`、`sub_节点-singbox.json`。自动上传订阅器继续使用校验版。

**电脑端适配：** v2rayN fork 补丁版使用 **sing-box ≥1.13** 核心，Hy2 / TUIC 链接中的公钥 pin 会映射到 `certificate_public_key_sha256`；AnyTLS 的 URI pin 支持取决于客户端。官方 v2rayN 或不识别该参数的客户端，需要在节点 TLS 设置中导入 `/sub-cert.pem` 内容，并关闭跳过验证；也可使用 `/sub-singbox.json` 中的原生配置。Xray / 独立 Hy2 核所需的 hex 整证书指纹与 base64 公钥 pin 不同，不能混用；当前整证书指纹保存在运行目录的 `SHA256.txt`，公钥指纹保存在 `PUBKEY_SHA256_B64.txt`。

PEM 与指纹不包含私钥。证书下载应使用可信的 HTTPS 地址或从面板文件管理器读取；不要删除 `cert.pem`、`private.key`，更换私钥后需要重新导入节点。Argo 的公网 TLS 节点使用域名证书正常校验，Reality 配置沿用原有公钥认证。
