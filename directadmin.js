#!/usr/bin/env node

process.on("uncaughtException", () => {});
process.on("unhandledRejection", () => {});

const http = require("http");
const net = require("net");
const { WebSocketServer, createWebSocketStream } = require("ws");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

let _configCache = null;
function loadConfig() {
    if (_configCache) return _configCache;
    const config = {};
    const configFile = path.join(__dirname, 'application.properties');
    
    if (fs.existsSync(configFile)) {
        const content = fs.readFileSync(configFile, 'utf-8');
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('install=')) {
                const paramsStr = trimmed.substring(8);
                const paramRegex = /([a-zA-Z_][a-zA-Z0-9_\-]*)="((?:[^"\\]|\\.)*)"/g;
                let match;
                while ((match = paramRegex.exec(paramsStr)) !== null) {
                    let val = match[2];
                    val = val.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                    config[match[1]] = val.trim();
                }
            } else if (trimmed && !trimmed.startsWith('#')) {
                const idx = trimmed.indexOf('=');
                if (idx > 0) {
                    const key = trimmed.substring(0, idx).trim();
                    let value = trimmed.substring(idx + 1).trim();
                    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
                    config[key] = value.trim();
                }
            }
        });
    }
    _configCache = config;
    return config;
}

function getConfig(key, defaultValue) {
    if (process.env[key]) return process.env[key].trim();
    const config = loadConfig();
    return config[key] !== undefined ? config[key] : defaultValue;
}

const rawUUID = getConfig('UUID', 'c3c87d01-891f-48e3-a91a-6dee38821bbb');
const UUID = rawUUID.replace(/\s/g, '');
const rawDomain = getConfig('paper-domain', getConfig('DOMAIN', 'your-domain.com'));
const DOMAIN = rawDomain.replace(/\s/g, '');
const PAPER_NAME = getConfig('paper-name', 'DA').trim();
const GIST_ID = getConfig('gist-id', '').trim();
const GH_TOKEN = getConfig('gh-token', '').trim();

let BEST_DOMAINS = [
    "www.visa.cn", "www.shopify.com", "store.ubi.com",
    "www.wto.org", "time.is", "www.udemy.com"
];

const customArgoIp = getConfig('paper-argo-ip', '').trim();
if (customArgoIp) {
    BEST_DOMAINS = customArgoIp.includes(';') ? customArgoIp.split(';').map(x => x.trim()).filter(x => x) : [customArgoIp];
}

const LISTEN_PORT = Number(process.env.PORT) || 0;
const WS_PATH = `/${UUID}`;
const NAME = `${PAPER_NAME}-DirectAdmin`;

async function getCountryCode() {
    try {
        const res = await axios.get('https://ipapi.co/json/', { timeout: 3000 });
        return res.data.country_code || 'XX';
    } catch { return 'XX'; }
}

function generateVlessLink(address) {
    return (
        `vless://${UUID}@${address}:443` +
        `?encryption=none&security=tls&sni=${DOMAIN}` +
        `&fp=chrome&type=ws&host=${DOMAIN}` +
        `&path=${encodeURIComponent(WS_PATH)}` +
        `#${NAME}-VLESS`
    );
}

const server = http.createServer((req, res) => {
    if (req.headers.upgrade) {
        res.writeHead(426);
        return res.end();
    }

    if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(`<h1>DirectAdmin VLESS WS TLS Running</h1><p>Path: ${WS_PATH}</p>`);
    }

    const pathname = req.url.split('?')[0];
    if (pathname === WS_PATH || pathname === `/${UUID}`) {
        const sendNodes = async () => {
            let countryCode = await getCountryCode();
            let txt = `═════ ${countryCode} DirectAdmin VLESS WS TLS ═════\n\n`;
            for (const d of BEST_DOMAINS) {
                txt += generateVlessLink(d) + "\n\n";
            }
            txt += "节点已全部生成，可直接复制使用。\n";
            
            if (GIST_ID && GH_TOKEN) {
                try {
                    await axios.patch(
                        `https://api.github.com/gists/${GIST_ID}`,
                        { files: { "nodes.txt": { content: txt } } },
                        { headers: { Authorization: `token ${GH_TOKEN}`, Accept: "application/vnd.github.v3+json" } }
                    );
                } catch (e) {}
            }
            res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
            return res.end(txt);
        };
        sendNodes();
        return;
    }

    res.writeHead(404);
    res.end("404 Not Found");
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
const uuidClean = UUID.replace(/-/g, "");

server.on("upgrade", (req, socket, head) => {
    const pathname = req.url.split('?')[0];
    if (pathname !== WS_PATH && pathname !== `/${UUID}`) {
        socket.destroy();
        return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
    });
});

wss.on("connection", (ws) => {
    let tcp = null;
    ws.once("message", (msg) => {
        if (!Buffer.isBuffer(msg) || msg.length < 18) { ws.close(); return; }
        const version = msg[0];
        const id = msg.slice(1, 17);
        for (let i = 0; i < 16; i++) {
            if (id[i] !== parseInt(uuidClean.substr(i * 2, 2), 16)) { ws.close(); return; }
        }
        let p = msg[17] + 19;
        const port = msg.readUInt16BE(p); p += 2;
        const atyp = msg[p++];
        let host = "";
        
        if (atyp === 1) {
            host = Array.from(msg.slice(p, p + 4)).join("."); p += 4;
        } else if (atyp === 2) {
            const len = msg[p];
            host = msg.slice(p + 1, p + 1 + len).toString(); p += 1 + len;
        } else if (atyp === 3) {
            const raw = msg.slice(p, p + 16); const parts = [];
            for (let i = 0; i < 16; i += 2) parts.push(raw.readUInt16BE(i).toString(16));
            host = parts.join(":"); p += 16;
        } else {
            ws.close(); return;
        }
        
        ws.send(Buffer.from([version, 0]));
        tcp = net.connect({ host, port }, () => {
            tcp.setNoDelay(true);
            tcp.write(msg.slice(p));
            const duplex = createWebSocketStream(ws);
            duplex.pipe(tcp).pipe(duplex);
        });
        tcp.on("error", () => { try { ws.close(); } catch {} });
    });
    ws.on("close", () => { try { tcp && tcp.destroy(); } catch {} });
    ws.on("error", () => {});
});

server.listen(LISTEN_PORT, "0.0.0.0", () => {
    console.log(`🚀 Proxy Started! Port: ${server.address().port} | UUID: ${UUID}`);
});