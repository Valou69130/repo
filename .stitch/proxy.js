// Stitch MCP local proxy — adds Google auth token to all requests
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

const PORT = 3034;

function getToken() {
  try {
    return execSync('/Users/vali/google-cloud-sdk/bin/gcloud auth print-access-token 2>/dev/null', { timeout: 5000 }).toString().trim();
  } catch { return ''; }
}

http.createServer((req, res) => {
  const token = getToken();
  let body = [];
  req.on('data', c => body.push(c));
  req.on('end', () => {
    body = Buffer.concat(body);
    const opts = {
      hostname: 'stitch.googleapis.com',
      path: req.url || '/mcp',
      method: req.method,
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
        'accept': 'application/json, text/event-stream',
        ...(body.length ? { 'content-length': body.length } : {}),
      },
    };
    const pr = https.request(opts, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    pr.on('error', e => { res.writeHead(502); res.end(e.message); });
    if (body.length) pr.write(body);
    pr.end();
  });
}).listen(PORT, () => console.log(`Stitch proxy → http://localhost:${PORT}`));
