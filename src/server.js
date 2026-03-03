const fs = require('fs');
const http = require('http');
const path = require('path');
const { convertScriptToEpisode } = require('./converter');

const port = process.env.PORT || 3000;
const publicDir = path.resolve(__dirname, '..', 'public');

function sendJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    return serveFile(res, path.join(publicDir, 'index.html'), 'text/html; charset=utf-8');
  }

  if (req.method === 'POST' && req.url === '/api/convert') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const episode = convertScriptToEpisode(payload);
        sendJson(res, 200, { ok: true, episode });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message || String(error) });
      }
    });

    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, () => {
  console.log(`Script-to-Episode app running at http://localhost:${port}`);
});
