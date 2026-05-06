process.on("uncaughtException", (err) => { console.error("[全局异常]", err); });
process.on("unhandledRejection", (reason) => { console.error("[异步拒绝]", reason); });

const fs = require("fs");
const path = require("path");

try {
    const text = fs.readFileSync(path.join(__dirname, 'application.properties'), 'utf8');
    const match = text.match(/install=(.*)/);
    if (match) {
        const paramRegex = /([a-zA-Z0-9_\-]+)=["']?([^"'\s]*)["']?/g;
        let m;
        while ((m = paramRegex.exec(match[1])) !== null) {
            process.env[m[1]] = m[2];
        }
    }
} catch (e) { console.error("[配置读取失败]", e); }

const UUID = (process.env.UUID || "abcd1eb2-1c20-345a-96fa-cdf394612345").trim();
const DOMAIN = (process.env['paper-domain'] || process.env.DOMAIN || "abc.domain.dpdns.org").trim();
const NAME = process.env['paper-name'] ? `${process.env['paper-name']}-DirectAdmin` : "DirectAdmin-easyshare";
const LISTEN_PORT = Number(process.env.PORT) || 0;

console.log(`[启动参数] UUID: ${UUID}`);
console.log(`[启动参数] DOMAIN: ${DOMAIN}`);

// --- ttyd 配置 ---
const TTYD_ENABLED = process.env['paper-ttyd'] === 'true';
const TTYD_PORT = process.env['ttyd-port'] || '7879';
const TTYD_CRED = process.env['ttyd-credential'] || 'ttyd:ttyd123';

if (TTYD_ENABLED) {
    const { spawn } = require('child_process');
    
    function startTTYD() {
        const ttydPath = path.join(__dirname, 'ttyd');
        if (!fs.existsSync(ttydPath)) {
            console.log("[ttyd] 未找到 ttyd 二进制文件，跳过启动");
            return;
        }
        const ttyd = spawn(ttydPath, ['-p', TTYD_PORT, '-c', TTYD_CRED, '-W', 'bash'], {
            cwd: __dirname,
            detached: true,
            stdio: 'ignore'
        });
        ttyd.unref();
        console.log(`🚀 ttyd 终端服务已启动 (Port: ${TTYD_PORT}, Cred: ${TTYD_CRED})`);
    }
    
    // 启动 ttyd
    startTTYD();
    
    // 每5分钟检查一次 ttyd 进程状态
    setInterval(() => {
        const { exec } = require('child_process');
        exec(`pgrep -u $USER -f "ttyd -p ${TTYD_PORT}"`, (err, stdout) => {
            if (!stdout) {
                console.log("[ttyd] 检测到停止，正在重新拉起...");
                startTTYD();
            }
        });
    }, 300000);
}

let BEST_DOMAINS = [
    "www.visa.cn",
    "www.shopify.com",
    "store.ubi.com",
    "www.wto.org",
    "time.is",
    "www.udemy.com",
];

if (process.env['paper-argo-ip']) {
    BEST_DOMAINS = process.env['paper-argo-ip'].split(';').map(s => s.trim()).filter(Boolean);
}

const http = require("http");
const net = require("net");
const { WebSocketServer, createWebSocketStream } = require("ws");

const WS_PATH = `/${UUID}`;

function generateLink(address) {
    return (
        `vless://${UUID}@${address}:443` +
        `?encryption=none&security=tls&sni=${DOMAIN}` +
        `&fp=chrome&type=ws&host=${DOMAIN}` +
        `&path=${WS_PATH}` +
        `#${NAME}`
    );
}

const server = http.createServer((req, res) => {
    if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(`<h1>VLESS WS TLS Running</h1><p>访问 ${WS_PATH} 查看节点</p>`);
    }

    if (req.url.startsWith(WS_PATH)) {
        let txt = "═════ VLESS WS TLS ═════\n\n";
        for (const d of BEST_DOMAINS) {
            txt += generateLink(d) + "\n\n";
        }
        txt += "节点已全部生成，可直接复制使用。\n";

        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end(txt);
    }
    res.writeHead(404);
    res.end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
const uuidClean = UUID.replace(/-/g, "");

server.on("upgrade", (req, socket, head) => {
    const rawUrl = req.url;
    const pathname = rawUrl.split('?')[0];
    
    console.log(`[1. WS收到握手] 原始URL: ${rawUrl} | 解析路径: ${pathname}`);

    if (pathname !== WS_PATH && pathname !== `/${UUID}`) {
        console.warn(`[握手拒绝] 路径不匹配。预期: ${WS_PATH}，实际: ${pathname}`);
        socket.destroy();
        return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
    });
});

wss.on("connection", (ws) => {
    console.log("[2. WS连接成功] 等待 VLESS 握手包...");
    let tcp = null;

    ws.once("message", (msg) => {
        if (!Buffer.isBuffer(msg) || msg.length < 18) {
            console.error("[VLESS错误] 数据包长度不足");
            ws.close();
            return;
        }

        const version = msg[0];
        const id = msg.slice(1, 17);

        for (let i = 0; i < 16; i++) {
            if (id[i] !== parseInt(uuidClean.substr(i * 2, 2), 16)) {
                console.error(`[3. UUID不匹配] 字节位置 ${i} 校验失败`);
                ws.close();
                return;
            }
        }
        console.log("[3. UUID校验通过]");

        let p = msg[17] + 19;
        const port = msg.readUInt16BE(p);
        p += 2;
        const atyp = msg[p++];
        
        console.log(`[调试] 附加长度 M: ${msg[17]}, 端口: ${port}, atyp: ${atyp}`);
        console.log(`[地址类型] atyp=${atyp} (1=IPv4, 2=域名, 3=IPv6)`);
        let host = "";

        if (atyp === 1) { host = Array.from(msg.slice(p, p + 4)).join("."); p += 4; }
        else if (atyp === 2) { const len = msg[p]; host = msg.slice(p + 1, p + 1 + len).toString(); p += 1 + len; }
        else if (atyp === 3) { 
            const raw = msg.slice(p, p + 16); const parts = [];
            for (let i = 0; i < 16; i += 2) parts.push(raw.readUInt16BE(i).toString(16));
            host = parts.join(":"); p += 16;
        }
        else {
            console.error(`[地址解析失败] 不支持的 atyp: ${atyp}`);
            ws.close();
            return;
        }

        if (!host) {
            console.error("[地址解析失败] host为空");
            ws.close();
            return;
        }

        console.log(`[4. 目标请求] 协议版本: ${version} | 地址: ${host}:${port}`);

        ws.send(Buffer.from([version, 0]));

        const targetHost = host === "localhost" ? "127.0.0.1" : host;

        console.log(`[5. TCP发起] 正在尝试连接目标: ${targetHost}:${port}...`);
        tcp = net.connect({ host: targetHost, port }, () => {
            console.log(`[6. TCP建立] 已成功建立到 ${targetHost} 的连接`);
            tcp.setNoDelay(true);
            tcp.write(msg.slice(p));
            const duplex = createWebSocketStream(ws);
            duplex.pipe(tcp).pipe(duplex);
        });

        tcp.on("error", (err) => {
            console.error(`[TCP异常] 连接 ${targetHost} 失败:`, err.message);
            try { ws.close(); } catch {}
        });
    });

    ws.on("close", () => { 
        console.log("[WS断开]");
        try { tcp && tcp.destroy(); } catch {} 
    });
});

server.listen(LISTEN_PORT, "0.0.0.0", () => {
    console.log(`🚀 服务已启动，监听端口: ${server.address().port}`);
});