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
