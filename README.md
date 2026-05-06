# nodejs-sshx 多面板部署教程

支持 **VLESS-WS** 节点部署，自动同步到 GitHub Gist。

---

## 选择你的面板

| 面板 | 部署文档 | 说明 |
|------|----------|------|
| 🖥️ DirectAdmin | [DirectAdmin 部署教程](README_DirectAdmin.md) | 仅 Node.js，无需外部二进制 |
| 🐲 翼龙面板 (Pterodactyl) | [翼龙面板部署教程](./README_Pterodactyl.md) | 支持 sing-box、ttyd、SSHX、WARP |

---

## 快速开始

1. 打开 [参数面板](https://zv201413.github.io/nodejs_sshx/)
2. 选择你的面板类型
3. 填写配置，复制生成的命令
4. 按对应部署文档操作

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

---

## 注意事项

- DirectAdmin 模式仅支持 VLESS-WS 协议
