const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function webRoot() {
  return path.join(__dirname, 'web');
}

function startServer() {
  const root = webRoot();
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root)) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          fs.readFile(path.join(root, 'index.html'), (fallbackErr, html) => {
            res.writeHead(fallbackErr ? 404 : 200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html || 'Not found');
          });
          return;
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function createWindow() {
  const server = await startServer();
  const port = server.address().port;
  const win = new BrowserWindow({
    width: 430,
    height: 900,
    minWidth: 380,
    minHeight: 680,
    backgroundColor: '#121212',
    title: 'Tekkzy Fit',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });
  win.loadURL('http://127.0.0.1:' + port + '/');
  win.on('closed', () => {
    try {
      server.close();
    } catch {
      /* ignore */
    }
  });
}

app.whenReady().then(() => {
  createWindow().catch((err) => {
    console.error(err);
    app.quit();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
