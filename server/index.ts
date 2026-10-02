import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { apiRouter } from './routes/index';
import { startCloudDeviceBridge } from './providers/device/cloudBridge';
import { startExpirySync } from './providers/device/expirySync';
import { startWifiFollow } from './providers/device/wifiFollow';

const app = express();
const port = Number(process.env.PORT || 8787);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS' && req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Origin', String(req.headers.origin || '*'));
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
    res.setHeader('Access-Control-Allow-Headers', String(req.headers['access-control-request-headers'] || '*'));
    res.status(204).end();
    return;
  }
  next();
});
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'gym-access-local',
    database: process.env.DATABASE_PROVIDER || 'local-json',
    time: new Date().toISOString(),
  });
});

app.use('/api', apiRouter());

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'Server error';
  res.status(500).json({ error: message });
});

app.listen(port, () => {
  console.log(`Tekkzy Fit local API listening on http://127.0.0.1:${port}`);
  startWifiFollow();
  startCloudDeviceBridge();
  startExpirySync();
});
