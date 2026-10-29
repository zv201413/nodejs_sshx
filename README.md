# nodejs-sshx 多面板部署教程

## 选择你的面板

| 面板 | 部署文档 | 说明 |
|------|----------|------|
| 🖥️ DirectAdmin | [DirectAdmin 部署教程](README_DirectAdmin.md) | Node.js，ttyd可选 |
| 🐲 翼龙面板 (Pterodactyl) | [翼龙面板部署教程](./README_Pterodactyl.md) | 支持 sing-box、ttyd、SSHX、WARP |

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
| Gist 同步 | ✅ | ✅ |
| 探针集成（Komari） | ❌ | ✅ |

## 探针集成

翼龙面板现已原生支持 **Komari** / 哪吒监控探针。在参数面板中填入命令即可，无需额外转换工具。详见 [翼龙面板部署教程 - 探针集成](./README_Pterodactyl.md#探针集成komari--哪吒监控)。

探针命令会自动使用虚拟 HOME，优先 `/www/home`，不可写或与 `/etc/passwd` 匹配时回退到运行目录下的 `komari-home`，避开 CodeRed 等容器用户的 `nologin` shell。环境只注入探针子进程，主程序 HOME 保持原值。

## 浏览器保存探针与 Gist 凭据

[配置生成器](https://zv201413.github.io/nodejs_sshx/) 的「附加探针」支持以备注保存完整安装命令，「GitHub Gist 同步」支持保存 Gist ID 与 Token。填写后点击「保存到浏览器」，在浏览器密码提示中确认；下次点击「填入已存凭据」选择对应记录，配置命令会立即更新。探针安装命令可切换显示，GitHub Token 默认遮挡。

凭据保存在浏览器密码管理器中，页面不把安装命令或 Token 写入 localStorage。保存与回填按钮需要通过 HTTPS 或 localhost 打开页面，并使用支持 PasswordCredential 的浏览器（如 Chrome）；探针和 Gist 记录分别保存，重置页面不会删除已保存凭据。

## 日志大小与重启清理

配置生成器的「连接与节点 → 安装设置」提供**单个日志上限（MB）**，默认 **50**，可填 **1–1024**。生成的 `log-max-mb="50"` 参数也可通过环境变量 `LOG_MAX_MB` 设置。应用日志、Argo、ttyd 和 SSHX 的运行输出按写入大小限制；达到上限时清理旧内容，继续记录。已有运行日志每 10 秒检查一次。订阅、UUID、证书和配置文件不参与日志清理；面板自行收集的控制台日志仍由面板管理。

翼龙模式的组件文件登记在运行目录下的 `.runtime-files.json`。每次重启会先停止并删除上一轮登记的随机名称组件和相关日志，再下载本轮组件；中断的下载也会登记。旧版本遗留的六位随机文件按 sing-box、cloudflared、哪吒和 ttyd 的内容特征识别清理，其他文件保留。

页面上方集中放置协议与连接设置，下方「配置与部署」通过 **Gist 同步 / 附加探针 / 运行设置**页签切换配置，右侧实时生成命令；WARP 与终端凭证位于「运行设置」。

部署更新时，翼龙模式需同时上传 `index.js`、`log-limit.js`、`runtime-files.js`、`tls-cert.js`、`tls-links.js`、`package.json` 和 `application.properties`；DirectAdmin 模式需上传 `directadmin.js`、`log-limit.js`、`package.json` 和 `application.properties`。

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
