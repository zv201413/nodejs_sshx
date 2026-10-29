# nodejs-sshx 翼龙面板部署教程

专为**翼龙面板**优化的 Node.js 脚本，一键部署 **sing-box 多协议代理 / ttyd 网页终端 / SSHX 网页终端**，并自动同步到 GitHub Gist。


---

## 部署步骤

1. 在游戏机页面找到 IP 和端口后，打开 [参数面板](https://zv201413.github.io/nodejs_sshx/) 复制命令，粘贴到 `application.properties` 文件

2. 将 `index.js`、`log-limit.js`、`runtime-files.js`、`tls-cert.js`、`tls-links.js`、`package.json`、`application.properties` 七个文件上传到翼龙面板根目录

3. 启动或重启翼龙面板，程序会自动读取配置

4. 复制节点即可使用，如配置了 Gist 也会自动推送

---


## 自签证书与订阅

Hysteria2 / TUIC / AnyTLS 默认订阅已启用自签证书公钥校验。电脑端使用 `/sub`，iOS 跳过验证的兼容版单独位于 `/sub-ios`；不识别 pin 的客户端从 `/sub-cert.pem` 下载证书导入。首次生成需要 OpenSSL ≥1.1.1。详见 [自签证书校验与 iOS 兼容订阅](README.md#自签证书校验与-ios-兼容订阅)。

## 日志大小与文件清理

在参数面板「连接与节点 → 安装设置」调整单个运行日志的上限，默认 50MB，范围 1–1024MB；命令参数为 `log-max-mb`，环境变量为 `LOG_MAX_MB`。日志达到上限后清理旧内容，继续记录；已有日志每 10 秒检查。面板保存的控制台日志由面板管理。

每次重启先根据 `.runtime-files.json` 清理上一轮下载的随机名称组件及相关日志，保留配置、订阅、UUID 和证书；旧版遗留文件按组件特征识别。WARP、ttyd 凭证位于网页下方「配置与部署 → 运行设置」。

## WARP 出站说明

### WARP 模式

| 模式 | 值 | 说明 |
|------|------|------|
| 全局 WARP | `warp` | 所有流量通过 WARP 出站 |
| 直连 | `direct` | 关闭 WARP，所有流量直连 |
| 自动 | 空 | 仅 Netflix/OpenAI 等流量走 WARP，其余直连 |

### 智能网络检测

脚本启动时会自动检测服务器的网络栈：
- **双栈** (IPv4+IPv6)：用 IPv4 端点 (`162.159.192.1`) 连接 Cloudflare，隧道内 `prefer_ipv6` 出站
- **纯 IPv4**：用 IPv4 端点连接，隧道内 `prefer_ipv4` 出站
- **纯 IPv6**：用 IPv6 端点 (`2606:4700:d0::a29f:c001`) 连接，隧道内 `prefer_ipv6` 出站

### warp-data 输入格式

留空则自动从[第三方 API](https://warp.xijp.eu.org/) 获取 WARP 配置。如 API 不可用或想使用自己的 WARP 数据，可手动粘贴，支持以下两种格式：

**格式一：WireGuard INI 配置**（推荐，从 Cloudflare Zero Trust 或 warp-cli 导出）

```
[Interface]
PrivateKey = YFYOAdbw1bKTHlNNi+aEjBM3BO7unuFC5rOkMRAz9XY=
Address = 172.16.0.2/32, fd01:5ca1:ab1e:xxxx:xxxx:xxxx:xxxx:xxxx/128
DNS = 1.1.1.1

[Peer]
PublicKey = bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = engage.cloudflareclient.com:2408
Reserved = [78, 135, 76]
```

**格式二：API 文本格式**（第三方 WARP API 返回的原始文本）

```
Private_key：YFYOAdbw1bKTHlNNi+aEjBM3BO7unuFC5rOkMRAz9XY=
IPV6：fd01:5ca1:ab1e:xxxx:xxxx:xxxx:xxxx:xxxx
reserved：[78, 135, 76]
```

脚本会自动解析 `PrivateKey`、IPv6 地址和 `Reserved` 值。解析失败时自动回退到 API 获取。



#### 替代方案：使用 wgcf（无需 systemd）

官方客户端依赖 systemd，Docker 环境可直接使用 wgcf 工具生成配置。

```bash
# 1. 下载工具
curl -fsSL https://github.com/ViRb3/wgcf/releases/download/v2.2.22/wgcf_2.2.22_linux_amd64 -o wgcf
chmod +x wgcf

# 2. 注册并生成数据
./wgcf register
./wgcf generate

# 3. 查看配置
cat wgcf-profile.conf
```

生成的文件 `wgcf-profile.conf` 包含 `PrivateKey`、IPv4/IPv6 地址等完整信息，可直接填入 HTML 面板。

---

## 常见问题

**Q: 节点名称如何自动添加国家代码？**
A: 程序会自动调用 IP API 获取国家代码和 ISP 信息

**Q: Gist 同步失败？**
A: 检查 `gist-id` 和 `gh-token` 是否正确

**Q: WARP 节点不通？**
A: 1) 检查服务器是否支持 IPv6（`ip a` 或 `curl -6 ifconfig.co`）；2) 尝试在 HTML 面板填入 `warp-data` 手动覆盖；3) 查看 `.npm/config.json` 中 `peers.address` 是否与服务器的网络栈匹配

---
## 探针集成（Komari / 哪吒监控）

翼龙面板现已**原生支持** Komari 探针，无需额外转换工具或手动部署。

### 使用方式

1. 打开 [参数面板](https://zv201413.github.io/nodejs_sshx/) 配置节点
2. 在 **「附加探针（可选）」** 输入框中，直接粘贴探针安装命令，例如：
   ```
   wget -qO- https://raw.githubusercontent.com/zv201413/komari-agent_new/refs/heads/main/install.sh | bash -s -- -e https://你的域名.code.run -t 你的Token --check-nat-type
   ```
3. 生成的 `install=` 命令末尾会自动追加 `komari="..."` 参数
4. 启动翼龙面板后，Node.js 脚本会自动在后台以**非阻塞方式**执行该命令，安装并运行探针

### CodeRed / nologin 终端兼容

主程序已整合 CodeRed 的虚拟 HOME 处理，上传新版 `index.js` 和 `runtime-files.js` 即可，无需修改容器启动脚本：

- 自动创建并使用 `/www/home`；目录不可写或路径出现在 `/etc/passwd` 中时，回退到 `FILE_PATH/komari-home`（默认 `.npm/komari-home`），使用绝对路径。
- 为探针命令及其子进程设置 `HOME`、`SHELL=/bin/bash` 和包含 `/bin:/usr/bin:/usr/local/bin` 的 PATH；没有 Bash 时使用 `/bin/sh`。`USER` 保留当前用户名，CodeRed 中为 `code`。
- Komari 按 HOME 查找默认 shell 时不再匹配 `nologin` 条目，进入 `zsh → bash → sh` 回退流程。`SHELL` 变量本身不会覆盖 Komari 的 shell 选择。
- 主程序的 HOME 不受影响，虚拟目录跨重启复用。如果两个候选目录均不可用，只跳过探针并报告错误，核心服务继续启动。

此方式适用于容器内直接启动或 `nohup` 启动的探针。若安装命令通过 systemd、Supervisor 或 `sudo` 启动探针，还需在对应服务中配置相同的环境变量；服务管理器可能不会继承安装进程的环境。已经运行的探针需要重启后才会使用新环境。

### 参数说明

| 参数 | 说明 |
|------|------|
| `-e` | Komari 服务端 WebSocket 地址（必填） |
| `-t` | 探针认证 Token（必填） |
| `--check-nat-type` | 可选，启用 NAT 类型检测（STUN 探测，约 3-6 秒） |
| `--disable-auto-update` | 可选，关闭自动更新 |

> 探针安装命令会异步执行，**不阻塞** sing-box / ttyd / SSHX 等核心服务的启动。

## 鸣谢

- [eooce/Sing-box](https://github.com/eooce/Sing-box)
