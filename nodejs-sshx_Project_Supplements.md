# nodejs-sshx 技术总结补充

**补充日期**: 2026-03-20
**补充原因**: 首次归档，基于实际部署经验补充

---

## 新增踩坑记录

### 1. Gist Token 权限配置

**问题**: Gist 同步返回 404 错误
**原因**: GitHub Fine-grained token 默认没有 Gists 权限
**解决方案**: 创建 Token 时必须：
1. Repository access 选择 "Only select repositories" > 任意一个仓库
2. Permissions 下滑找到 **Gists**，勾选 **Manage**

---

### 2. SSHX 链接不完整

**问题**: SSHX 链接打不开
**原因**: 正则表达式没有匹配 `#` 后的 token
**解决方案**: 更新正则

```javascript
// 错误：只匹配到域名部分
/https:\/\/sshx\.io\/s\/[a-zA-Z0-9]+/

// 正确：包含 #token 完整部分
/https:\/\/sshx\.io\/s\/[a-zA-Z0-9]+#[a-zA-Z0-9]+/
```

---

### 3. getConfig 函数初始化顺序

**问题**: `ReferenceError: Cannot access 'fileConfig' before initialization`
**原因**: `fileConfig` 在第 67 行才初始化，但 `getConfig()` 在第 13 行就被调用
**解决方案**: 调整代码顺序，配置加载必须在使用之前

```javascript
// 1. 先读取配置文件
const fileConfig = loadConfigFile();

// 2. 再定义和使用函数
function getConfig(envKey, fileKey, defaultValue) { ... }
const XYZ = getConfig('XYZ', 'XYZ', 'default');
```

---

### 4. 翼龙面板代码重复粘贴

**问题**: 进程启动失败，报 `Identifier 'express' has already been declared`
**原因**: 多次粘贴代码导致 `require` 语句重复
**解决方案**: 确保文件只有一份 require 语句

---

## 后续移植建议

### 1. 配置文件加载模式

| 场景 | 推荐方案 |
|:---|:---|
| 翼龙面板等受限环境 | `application.properties` 或 `config.json` |
| Serv00、Replit | 环境变量 |
| 本地开发 | `.env` 文件 |

### 2. Gist 同步最佳实践

- 使用同一个 Gist ID 可以创建多个文件
- 每个功能对应一个文件名（如 `sshx.txt`、`sub.txt`）
- Token 有效期建议设置 30 天，定期续期

### 3. SSHX 集成检查清单

- [ ] Cloudflare Zero Trust 创建 Self-hosted 应用
- [ ] 配置 Email OTP 身份验证
- [ ] 添加访问策略允许指定邮箱
- [ ] 测试链接可正常打开

### 4. 临时文件清理策略

- 二进制文件：90 秒后删除
- SSHX 链接：同步到 Gist 后立即删除本地文件
- 节点订阅：同步到 Gist 后立即删除本地文件

---

## 本项目可优化点

1. **多服务器管理**: 目前单节点，可扩展为多节点管理
2. **定时检查**: 添加进程存活检测，自动重启
3. **日志持久化**: 目前无日志文件，可考虑日志同步到 Gist
4. **Telegram 通知**: 可添加启动/异常通知

---

**更新日期**: 2026-03-20
