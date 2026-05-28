# nodejs-sshx 技术总结归档

**归档状态**: Finalized (v2.0)
**更新日期**: 2026-03-31
**技术栈**: Node.js + sing-box + Cloudflare Argo + SSHX + GitHub Gist API

---

## 1. 项目背景

专为**翼龙面板**优化的 Node.js 脚本，一键部署 **sing-box 多协议代理 + SSHX 网页终端**，并自动同步到 GitHub Gist。

**核心需求**：
- 在单端口受限环境下提供高性能代理服务（Hysteria2/VLESS-WS）
- 提供便捷的远程管理终端（SSHX）
- 实现无端口开放情况下的稳定访问（Argo Tunnel）
- 自动同步连接信息（Gist Sync）
- 支持 WARP 出站模式

---

## 2. 核心架构与调度策略

### 2.1 配置文件映射

| install= 参数 | 内部变量 | 说明 |
|:---|:---|:---|
| `paper-name` | PAPER_NAME | 节点名称前缀 |
| `paper-argo` | PAPER_ARGO | Argo 协议类型 (vless-ws/vmess-ws) |
| `paper-argo-ip` | PAPER_ARGO_IP | Argo 优选 IP |
| `paper-domain` | PAPER_DOMAIN | 自定义节点地址 |
| `paper-hy2-port` | PAPER_HY2_PORT | Hysteria2 端口 |
| `paper-tuic-port` | PAPER_TUIC_PORT | TUIC 端口 |
| `paper-sshx` | PAPER_SSHX | SSHX 启用开关 |
| `gist-id` | GIST_ID | Gist ID |
| `gh-token` | GH_TOKEN | GitHub Token |
| `warp-mode` | WARP_MODE | WARP 出站模式 |

---

## 3. 文件职能与逻辑

### 3.1 index.js

| 函数/步骤 | 职能 |
|:---|:---|
| parseInstallParams() | 解析 install= 参数，支持命令行和配置文件 |
| fetchWarpConfig() | 从第三方 API 获取 WARP 配置 |
| getMetaInfo() | 获取服务器 IP、国家代码、ISP 信息 |
| generateSingboxConfig() | 生成 sing-box 配置文件 |
| syncToGist() | 同步链接到 GitHub Gist |
| startSSHX() | 启动 SSHX 网页终端 |

---

## 4. 核心技术突破

### 4.1 install= 参数解析
**问题**: 参数名包含连字符（如 `paper-hy2-port`），JavaScript 变量名不支持连字符

**解决方案**: 
- 正则表达式支持连字符：`/([a-zA-Z_][a-zA-Z0-9_\-]*)="([^"]*)"/g`
- getConfig 函数支持两种格式：连字符和下划线

### 4.2 Argo 模式下 sing-box TLS 配置
**背景**: 启用 Argo 后，客户端连接提示无法到达原始服务

**解决方案**: Sing-box Inbound 禁用 TLS（`tls.enabled: false`），TLS 由 Argo 隧道外部提供

### 4.3 VLESS 链接格式兼容
**背景**: 客户端对 VLESS 链接格式有特殊要求

**解决方案**: 
- 使用 `type=ws` 替代 `network=ws`
- 对 path 进行 URL 编码：`%2Fvless-argo`
- 添加 `insecure=1&allowInsecure=1`

### 4.4 WARP 出站配置
**问题**: 需要实现 WARP 出站功能

**解决方案**: 
- 从第三方 API 自动获取 WARP 配置
- 支持 warp/direct/auto 三种模式

---

## 5. 踩坑记录

| 问题现象 | 错误尝试 | 正确解法 |
|:---|:---|:---|
| 参数解析失败 | 正则表达式不支持连字符 | 修改正则为 `/([a-zA-Z_][a-zA-Z0-9_\-]*)=/` |
| VLESS 节点不通 | 缺少 insecure 参数 | 添加 `insecure=1&allowInsecure=1` |
| Argo 隧道连接失败 | sing-box 开启 TLS | 禁用本地 TLS，由 Argo 提供 |
| HY2 节点 IP 错误 | 使用自动获取的 IP | 使用 paper-domain 配置的 IP |

---

## 6. 归档文件说明

| 文件 | 说明 |
|:---|:---|
| index.js | 主程序 |
| package.json | Node.js 依赖 |
| application.properties | 配置文件模板 |
| README.md | 用户文档 |

---

## 7. 更新记录

| 日期 | 版本 | 变更内容 |
|:---|:---|:---|
| 2026-03-31 | v2.0 | 新增 install= 参数支持、WARP 出站功能 |
| 2026-03-20 | v1.0 | 初始归档，基础功能实现 |
