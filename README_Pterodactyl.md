# nodejs-sshx 翼龙面板部署教程

专为**翼龙面板**优化的 Node.js 脚本，一键部署 **sing-box 多协议代理 / ttyd 网页终端 / SSHX 网页终端**，并自动同步到 GitHub Gist。


---

## 部署步骤

1. 在游戏机页面找到 IP 和端口后，打开 [参数面板](https://zv201413.github.io/nodejs_sshx/) 复制命令，粘贴到 `application.properties` 文件

2. 将 `index.js`、`package.json`、`application.properties` 三个文件上传到翼龙面板根目录

3. 启动或重启翼龙面板，程序会自动读取配置

4. 复制节点即可使用，如配置了 Gist 也会自动推送

---


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

留空则自动从第三方 API 获取 WARP 配置。如 API 不可用或想使用自己的 WARP 数据，可手动粘贴，支持以下两种格式：

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

## 鸣谢

- [eooce/Sing-box](https://github.com/eooce/Sing-box)
