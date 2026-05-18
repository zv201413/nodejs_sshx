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

## 进阶玩法

如需使用哪吒/Komari探针，请至少选择配置面板任意一种web ssh，然后进入部署（Komari请将原始命令粘贴到 [Argosbx 转换面板](https://zv201413.github.io/argosbx-new/)，一键生成免 systemd 的 `nohup` 容器专用命令后再执行）
<img width="1609" height="538" alt="image" src="https://github.com/user-attachments/assets/fc6d314a-961a-4c93-a6a3-2d906989c555" />
