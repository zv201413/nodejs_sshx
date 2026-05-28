# nodejs-sshx 归档日志

| 日期 | 版本 | 归档内容 | 主要变更 |
|:---|:---|:---|:---|
| 2026-03-20 | v1.0 | 首次归档 | 完整功能：sing-box 多协议 + SSHX + Gist 同步 |

---

## 历史版本

### v1.0 (2026-03-20)

**归档内容**:
- 核心脚本: `index.js`
- 依赖配置: `package.json`
- 配置文件: `application.properties`、`config.json`
- 用户文档: `README.md`
- 技术归档: `Project_Summary.md`、`Project_Supplements.md`、`Archive_Log.md`

**主要变更**:
- 基于 eooce/Sing-box 项目修改
- 新增 SSHX 网页终端集成
- 新增 GitHub Gist 同步功能
- 支持翼龙面板配置文件方式配置
- 90 秒后自动清理临时文件
- 二进制文件随机名称混淆

**实现的功能**:
- sing-box 多协议代理（Hysteria2、TUIC、Reality、AnyTLS、Socks5、Vmess-WS）
- Cloudflare Argo 隧道（固定域名/临时隧道）
- SSHX 网页终端（sshx.io）
- GitHub Gist 自动同步（SSHX 链接 + 节点订阅）
- 文件名混淆（随机 6 位字符）
- 进程自清理（90 秒后删除二进制）

---
