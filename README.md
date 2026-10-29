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
