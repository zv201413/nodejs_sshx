# nodejs-sshx

多面板 Node.js 脚本，支持翼龙/Pterodactyl 和 DirectAdmin

**当前版本**: v1.2.0
**技术栈**: Node.js, sing-box, Cloudflare Argo, ttyd, SSHX

---

## 🌟 核心特色

- 多协议支持: VLESS-WS, VMess-WS, Hysteria2, TUIC, Reality, SOCKS5, AnyTLS
- 双网页终端: ttyd + SSHX
- Cloudflare Argo 隧道
- GitHub Gist 同步
- 双面板兼容: index.js + directadmin.js

---

## 🚀 快速开始

翼龙: npm start
DirectAdmin: npm run directadmin


---

## 🛠️ 环境映射 (Env Mapping)

| 变量名 | 说明 | 示例 |
|:---|:---|:---|
| 翼龙 | application.properties | install=xxx |
| DirectAdmin | 环境变量 | NODE_ENV=xxx |

---

**文档更新时间**: 2026-05-09
