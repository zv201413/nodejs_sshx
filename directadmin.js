process.on("uncaughtException", () => {});
process.on("unhandledRejection", () => {});

const fs = require("fs");
try {
    const text = fs.readFileSync('application.properties', 'utf8');
    const match = text.match(/install=(.*)/);
    if (match) {
        const paramRegex = /([a-zA-Z0-9_\-]+)="([^"]*)"/g;
        let m;
        while ((m = paramRegex.exec(match[1])) !== null) {
            process.env[m[1]] = m[2];
        }
    }
} catch (e) {}

const UUID = (process.env.UUID || "abcd1eb2-1c20-345a-96fa-cdf394612345").trim();
const DOMAIN = (process.env['paper-domain'] || process.env.DOMAIN || "abc.domain.dpdns.org").trim();
const NAME = process.env['paper-name'] ? `${process.env['paper-name']}-DirectAdmin` : "DirectAdmin-easyshare";
const LISTEN_PORT = Number(process.env.PORT) || 0;

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
        `&path=${encodeURIComponent(WS_PATH)}` +
        `#${NAME}`
    );
}

const server = http.createServer((req, res) => {
    if (req.headers.upgrade) {
        res.writeHead(426);
        return res.end();
    }

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
    res.end("404 Not Found");
});

const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 256 * 1024,
});

const uuidClean = UUID.replace(/-/g, "");

server.on("upgrade", (req, socket, head) => {
    if (!req.url.startsWith(WS_PATH)) {
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
        if (!Buffer.isBuffer(msg) || msg.length < 18) {
            ws.close();
            return;
        }

        const version = msg[0];
        const id = msg.slice(1, 17);

        for (let i = 0; i < 16; i++) {
            if (id[i] !== parseInt(uuidClean.substr(i * 2, 2), 16)) {
                ws.close();
                return;
            }
        }

        let p = msg[17] + 19;
        const port = msg.readUInt16BE(p); p += 2;
        const atyp = msg[p++];

        let host = "";

        if (atyp === 1) {
            host = Array.from(msg.slice(p, p + 4)).join(".");
            p += 4;
        } else if (atyp === 2) {
            const len = msg[p];
            host = msg.slice(p + 1, p + 1 + len).toString();
            p += 1 + len;
        } else if (atyp === 3) {
            const raw = msg.slice(p, p + 16);
            const parts = [];
            for (let i = 0; i < 16; i += 2) {
                parts.push(raw.readUInt16BE(i).toString(16));
            }
            host = parts.join(":");
            p += 16;
        } else {
            ws.close();
            return;
        }

        ws.send(Buffer.from([version, 0]));

        tcp = net.connect({ host, port }, () => {
            tcp.setNoDelay(true);
            tcp.write(msg.slice(p));
            const duplex = createWebSocketStream(ws);
            duplex.pipe(tcp).pipe(duplex);
        });

        tcp.on("error", () => {
            try { ws.close(); } catch {}
        });
    });

    ws.on("close", () => {
        try { tcp && tcp.destroy(); } catch {}
    });

    ws.on("error", () => {});
});

server.listen(LISTEN_PORT, "0.0.0.0");