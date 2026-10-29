'use strict';

const net = require('node:net');

function hostAddress(host) {
  const bare = host.replace(/^\[|\]$/g, '');
  return net.isIP(bare) === 6 ? '[' + bare + ']' : bare;
}

function buildTlsNode(protocol, { uuid, host, port, name }, info) {
  if (!info || !/^[A-Za-z0-9+/]{43}=$/.test(info.publicKeyPin)) throw new Error('TLS 节点缺少有效公钥指纹');
  if (!['hysteria2', 'tuic', 'anytls'].includes(protocol)) throw new Error('不支持的 TLS 节点协议');
  const auth = protocol === 'tuic' ? encodeURIComponent(uuid) + ':' + encodeURIComponent(uuid) : encodeURIComponent(uuid);
  const uri = new URL(`${protocol}://${auth}@${hostAddress(host)}:${port}`);
  const params = uri.searchParams;
  params.set('security', 'tls');
  params.set('sni', info.serverName);
  params.set('insecure', '0');
  params.set('allowInsecure', '0');
  params.set('pinSHA256', info.publicKeyPin); // URLSearchParams encodes + / = exactly once.
  const outbound = {
    type: protocol, tag: protocol + '-' + name,
    server: host.replace(/^\[|\]$/g, ''), server_port: Number(port),
    password: uuid,
    tls: { enabled: true, server_name: info.serverName, insecure: false,
      certificate_public_key_sha256: [info.publicKeyPin] },
  };
  if (protocol !== 'anytls') {
    params.set('alpn', 'h3');
    outbound.tls.alpn = ['h3'];
  }
  if (protocol === 'tuic') {
    params.set('version', '5');
    params.set('allow_insecure', '0');
    params.set('congestion_control', 'bbr');
    params.set('udp_relay_mode', 'native');
    outbound.uuid = uuid;
    outbound.congestion_control = 'bbr';
  }
  uri.hash = encodeURIComponent(name);
  return { uri: uri.toString(), outbound };
}

function makeIosSubscription(text) {
  return text.split('\n').map(line => {
    if (!/^(?:hysteria2|tuic|anytls):\/\//.test(line)) return line;
    const uri = new URL(line);
    if (uri.searchParams.get('security') === 'reality') return line;
    const params = uri.searchParams;
    params.delete('pinSHA256');
    params.delete('allowInsecure');
    params.delete('insecure');
    if (uri.protocol === 'tuic:') {
      params.set('version', '5');
      params.set('allow_insecure', '1');
    } else {
      params.set('insecure', '1');
      if (uri.protocol === 'hysteria2:') params.set('peer', params.get('sni'));
    }
    return uri.toString();
  }).join('\n');
}

function buildSingboxConfig(outbounds) {
  if (!outbounds.length) return null;
  return {
    log: { level: 'info' },
    inbounds: [{ type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 1080 }],
    outbounds: [{ type: 'selector', tag: 'proxy', outbounds: outbounds.map(node => node.tag),
      default: outbounds[0].tag }, ...outbounds, { type: 'direct', tag: 'direct' }],
    route: { final: 'proxy' },
  };
}

function subscriptionFiles(filename, desktop, ios, info, singbox) {
  const stem = filename.replace(/\.[^./]+$/, '');
  const files = { [filename]: desktop + '\n', [stem + '-ios.txt']: ios + '\n' };
  if (info) files[stem + '-cert.pem'] = info.pem;
  if (singbox) files[stem + '-singbox.json'] = JSON.stringify(singbox, null, 2);
  return files;
}

function registerSubscriptionRoutes(app, subPath, getSnapshot) {
  for (const [suffix, type, select] of [
    ['', 'text/plain; charset=utf-8', data => Buffer.from(data.desktop).toString('base64')],
    ['-ios', 'text/plain; charset=utf-8', data => Buffer.from(data.ios).toString('base64')],
    ['-cert.pem', 'application/x-pem-file', data => data.info && data.info.pem],
    ['-singbox.json', 'application/json; charset=utf-8', data => data.singbox && JSON.stringify(data.singbox, null, 2)],
  ]) {
    app.get('/' + subPath + suffix, (req, res) => {
      const data = getSnapshot();
      if (!data) return res.status(503).send('节点尚未生成，请稍后重试');
      const content = select(data);
      if (!content) return res.status(404).send('未启用使用自签证书的 TLS 节点');
      res.set('Content-Type', type);
      res.set('Cache-Control', 'no-store');
      res.send(content);
    });
  }
}

module.exports = { buildTlsNode, makeIosSubscription, buildSingboxConfig, subscriptionFiles, registerSubscriptionRoutes };
