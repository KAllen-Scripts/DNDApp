/**
 * Download a file from the public internet, for addresses the AI found on the
 * web (a creature's picture). The server runs on the owner's own PC, so an
 * address must never reach it or anything on the home network: only http(s)
 * on the usual ports, and every connection (redirects too) is checked after
 * the name is looked up, so a name can't point somewhere private.
 */
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';

// Separate lists: one list would match every IPv4 address against ::/96.
const blocked4 = new net.BlockList();
const blocked6 = new net.BlockList();
for (const [range, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked4.addSubnet(range, bits, 'ipv4');
for (const [range, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32], ['::', 96], ['::ffff:0:0', 96]]) blocked6.addSubnet(range, bits, 'ipv6');

/** Is this an address on the public internet (not this machine, the home network or anything reserved)? */
export function isPublicAddress(ip) {
  const family = net.isIP(ip);
  if (!family) return false;
  if (family === 6) {
    // IPv4 written as IPv6 (::ffff:10.0.0.1) is checked as IPv4.
    const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (v4) return isPublicAddress(v4[1]);
    return !blocked6.check(ip, 'ipv6');
  }
  return !blocked4.check(ip, 'ipv4');
}

/** A name lookup that only ever answers with public addresses. */
function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, family: options.family ?? 0 }, (err, addresses) => {
    if (err) return callback(err);
    const ok = addresses.filter((a) => isPublicAddress(a.address));
    if (!ok.length) return callback(Object.assign(new Error(`${hostname} is not on the public internet`), { code: 'ENOTPUBLIC' }));
    if (options.all) return callback(null, ok);
    callback(null, ok[0].address, ok[0].family);
  });
}

/**
 * GET a public URL. Resolves { buf, type, url } (url: where it ended up), or
 * rejects with a plain message. Follows up to `redirects` redirects.
 */
export function fetchPublic(address, { maxBytes = 10 * 1024 * 1024, timeoutMs = 15_000, redirects = 3 } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(address);
    } catch {
      return reject(new Error('Not a web address.'));
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return reject(new Error('Only http and https addresses.'));
    if (url.username || url.password) return reject(new Error('Addresses with a login are not allowed.'));
    if (url.port && !['80', '443'].includes(url.port)) return reject(new Error('Only the usual web ports.'));
    const host = url.hostname.replace(/^\[|\]$/g, '');
    // Numeric addresses skip the lookup, so check them here.
    if (net.isIP(host) && !isPublicAddress(host)) return reject(new Error(`${host} is not on the public internet`));
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.get(url, { lookup: publicLookup, timeout: timeoutMs, headers: { 'user-agent': 'DNDApp/0.1 (creature picture)', accept: 'image/*' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error('Too many redirects.'));
        return fetchPublic(new URL(res.headers.location, url).href, { maxBytes, timeoutMs, redirects: redirects - 1 }).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`The site answered ${res.statusCode}.`));
      }
      if (Number(res.headers['content-length']) > maxBytes) {
        res.destroy();
        return reject(new Error('Too big.'));
      }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > maxBytes) {
          res.destroy();
          reject(new Error('Too big.'));
        } else chunks.push(c);
      });
      res.on('end', () => resolve({ buf: Buffer.concat(chunks), type: String(res.headers['content-type'] ?? ''), url: url.href }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('The site took too long.')));
    req.on('error', (err) => reject(new Error(err.code === 'ENOTPUBLIC' ? err.message : `Couldn't download it (${err.code ?? err.message}).`)));
  });
}
