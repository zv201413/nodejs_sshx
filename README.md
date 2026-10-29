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

## 浏览器保存探针与 Gist 凭据

[配置生成器](https://zv201413.github.io/nodejs_sshx/) 的「附加探针」支持以备注保存完整安装命令，「GitHub Gist 同步」支持保存 Gist ID 与 Token。填写后点击「保存到浏览器」，在浏览器密码提示中确认；下次点击「填入已存凭据」选择对应记录，配置命令会立即更新。探针安装命令可切换显示，GitHub Token 默认遮挡。

凭据保存在浏览器密码管理器中，页面不把安装命令或 Token 写入 localStorage。保存与回填按钮需要通过 HTTPS 或 localhost 打开页面，并使用支持 PasswordCredential 的浏览器（如 Chrome）；探针和 Gist 记录分别保存，重置页面不会删除已保存凭据。

## 日志大小与重启清理

配置生成器的「连接与节点 → 安装设置」提供**单个日志上限（MB）**，默认 **50**，可填 **1–1024**。生成的 `log-max-mb="50"` 参数也可通过环境变量 `LOG_MAX_MB` 设置。应用日志、Argo、ttyd 和 SSHX 的运行输出按写入大小限制；达到上限时清理旧内容，继续记录。已有运行日志每 10 秒检查一次。订阅、UUID、证书和配置文件不参与日志清理；面板自行收集的控制台日志仍由面板管理。

翼龙模式的组件文件登记在运行目录下的 `.runtime-files.json`。每次重启会先停止并删除上一轮登记的随机名称组件和相关日志，再下载本轮组件；中断的下载也会登记。旧版本遗留的六位随机文件按 sing-box、cloudflared、哪吒和 ttyd 的内容特征识别清理，其他文件保留。

页面上方集中放置协议与连接设置，下方「配置与部署」通过 **Gist 同步 / 附加探针 / 运行设置**页签切换配置，右侧实时生成命令；WARP 与终端凭证位于「运行设置」。

部署更新时，翼龙模式需同时上传 `index.js`、`log-limit.js`、`runtime-files.js`、`package.json` 和 `application.properties`；DirectAdmin 模式需上传 `directadmin.js`、`log-limit.js`、`package.json` 和 `application.properties`。
