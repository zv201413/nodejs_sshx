// Minimal multi-domain node generator backend (new workspace)
// Supports two modes: wingpanel (翼龙面板风格) and minimal argo (极简 Argo 节点)
// Returns a text-based node string per domain (one per domain per mode), joined as newline text.

const express = require('express');
const app = express();
app.use(express.json());

// Basic runtime defaults (can be overridden via env or future config)
const PORT = process.env.PORT || 3000;
const CFIP = process.env.CFIP || '104.17.100.191';
const CFPORT = process.env.CFPORT ? parseInt(process.env.CFPORT) : 443;
const PAPER_ARGO_IP = process.env.PAPER_ARGO_IP || '';
const PAPER_DOMAIN = process.env.PAPER_DOMAIN || '';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '';
const ARGO_AUTH = process.env.ARGO_AUTH || '';
const UUID = process.env.UUID || '00000000-0000-0000-0000-000000000000';

function isDomainLike(s) {
  if (!s || typeof s !== 'string') return false;
  // trivial domain pattern check (must contain a dot and not be pure IP)
  const isIp = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(s);
  const hasDot = /\.[A-Za-z]{2,}$/.test(s);
  return hasDot && !isIp;
}

function argoDomainFinalFrom(domain) {
  if (domain && isDomainLike(domain)) return domain;
  if (PAPER_DOMAIN && isDomainLike(PAPER_DOMAIN)) return PAPER_DOMAIN;
  if (ARGO_DOMAIN && isDomainLike(ARGO_DOMAIN)) return ARGO_DOMAIN;
  // Fallback to a safe default domain
  return 'example.com';
}

function pickArgoIP() {
  return PAPER_ARGO_IP && PAPER_ARGO_IP.trim() ? PAPER_ARGO_IP.trim() : CFIP;
}

function vmessLine(payload) {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `vmess://${b64}`;
}

function wingVLessLine(domain, argoIP) {
  const argoDomain = argoDomainFinalFrom(domain);
  return `vless://${UUID}@${argoIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=chrome&alpn=h2&insecure=1&allowInsecure=1&type=ws&host=${argoDomain}&path=%2Fvless-argo#${domain}`;
}

function wingVMessLine(domain, argoIP) {
  const argoDomain = argoDomainFinalFrom(domain);
  const payload = {
    v: '2',
    ps: domain,
    add: argoIP,
    port: CFPORT,
    id: UUID,
    aid: '0',
    scy: 'auto',
    net: 'ws',
    type: 'none',
    host: argoDomain,
    path: '/vmess-argo',
    tls: 'tls',
    sni: argoDomain,
    alpn: 'h2',
    fp: 'chrome',
    allowInsecure: 1
  };
  return vmessLine(payload);
}

function generateForDomain(domain) {
  const argoIP = pickArgoIP();
  // wingpanel two lines per domain
  const wingVLess = wingVLessLine(domain, argoIP);
  const wingVMess = wingVMessLine(domain, argoIP);
  return { wingVLess, wingVMess };
}

function generateNodes(domainsStr, mode) {
  const domains = domainsStr
    .split(';')
    .map(d => d.trim())
    .filter(Boolean);
  const results = [];
  for (const d of domains) {
    const lines = generateForDomain(d);
    results.push({ domain: d, lines: lines, mode: mode });
  }
  // Build text output: for compatibility, return newline-separated VMess lines only as a plain text stream
  // 将文本节点串拼成一个字符串：按域名输出两行（wingpanel）或单行（minimal）
  let text = '';
  for (const r of results) {
    if (mode === 'wingpanel') {
      text += r.lines.wingVLess + '\n' + r.lines.wingVMess + '\n';
    } else {
      // minimal 模式：仅输出 VMess 的文本节点串
      text += r.lines.wingVMess + '\n';
    }
  }
  return { nodes_text: text.trim(), raw: results, domains: domains };
}

app.post('/generate-nodes', (req, res) => {
  const domains = (req.body && req.body.domains) || '';
  const mode = (req.body && req.body.mode) || 'wingpanel';
  const result = generateNodes(domains, mode);
  // 安全起见，避免直接输出敏感信息；文本已经包含域名和伪秘钥信息（如 UUID），请在前端对敏感字段进行屏蔽/处理
  res.json({ mode, domains: result.domains, nodes_text: result.nodes_text, raw: result.raw });
});

app.listen(PORT, () => {
  console.log(`nodejs_sshx_new backend listening on ${PORT}`);
});
