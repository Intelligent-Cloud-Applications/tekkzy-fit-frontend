import { Router } from 'express';
import { ai806 } from '../providers/device/Ai806Client';
import { hikvision, isHikvisionHost } from '../providers/device/HikvisionClient';
import { applyDiscoveredHost, discoverTerminals, ensureReachableHost, probeSavedHost } from '../providers/device/discoverLan';
import { loadDeviceAuth, publicDeviceAuth, saveDeviceAuth } from '../providers/device/deviceAuth';
import { loadSchedules, saveSchedules, type DeviceSchedules } from '../providers/device/deviceSchedules';
import { markDeviceOnline, wifiFollowStatus } from '../providers/device/wifiFollow';
import { localSubnets } from '../providers/device/lanInfo';
import { optionalAuth } from '../middleware/auth';

async function useHikvision(): Promise<boolean> {
  const host = loadDeviceAuth().host;
  if (!host) return false;
  return Boolean(await isHikvisionHost(host).catch(() => null));
}

export function liveDeviceRouter(): Router {
  const router = Router();
  router.use(optionalAuth);

  router.get('/config', async (_req, res) => {
    const reachable = await probeSavedHost().catch(() => false);
    markDeviceOnline(reachable);
    const wifi = wifiFollowStatus();
    res.json({ ...publicDeviceAuth(), scanning: wifi.scanning, deviceOnline: reachable });
  });

  router.get('/ping', async (_req, res) => {
    const reachable = await probeSavedHost().catch(() => false);
    if (reachable) {
      markDeviceOnline(true);
      res.json({ ok: true, deviceOnline: true });
      return;
    }
    try {
      const hik = await useHikvision();
      const login = hik ? await hikvision.login() : await ai806.login();
      const ok = Boolean(login.ok);
      markDeviceOnline(ok);
      res.json({ ok, deviceOnline: ok });
    } catch {
      markDeviceOnline(false);
      res.json({ ok: false, deviceOnline: false });
    }
  });

  router.post('/config', (req, res) => {
    const current = loadDeviceAuth();
    const host = String(req.body.host ?? current.host).trim();
    const username = String(req.body.username ?? current.username).trim();
    const password = String(req.body.password ?? '').trim() || current.password;
    saveDeviceAuth({ host, username, password });
    const wifi = wifiFollowStatus();
    res.json({ ...publicDeviceAuth(), scanning: wifi.scanning, deviceOnline: wifi.deviceOnline });
  });

  router.get('/discover', async (req, res) => {
    try {
      const saved = loadDeviceAuth().host.replace(/^https?:\/\//, '').split('/')[0].trim();
      if (saved && (await probeSavedHost())) {
        res.json({
          lan: localSubnets().map((n) => `${n.base}.0/24 (laptop ${n.self})`),
          found: [{ host: saved, label: 'Saved terminal' }],
          applied: saved,
        });
        return;
      }
      const result = await discoverTerminals({ full: String(req.query.full || '') === '1' });
      const prefer = saved ? result.found.find((row) => row.host === saved) : undefined;
      const appliedHost = prefer?.host
        || (result.found.length === 1 ? result.found[0].host : null);
      if (appliedHost) applyDiscoveredHost(appliedHost);
      res.json({ ...result, applied: appliedHost });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Scan failed' });
    }
  });

  router.post('/test', async (_req, res) => {
    try {
      const hik = await useHikvision();
      const login = hik ? await hikvision.login() : await ai806.login();
      if (!login.ok) {
        // Fall back once if the wrong protocol was guessed.
        const alt = hik ? await ai806.login() : await hikvision.login();
        if (!alt.ok) {
          res.status(401).json(login);
          return;
        }
        res.json({ ...alt, sn: alt.sn, message: alt.message || `Connected to ${alt.sn || 'terminal'}` });
        return;
      }
      res.json({ ...login, sn: login.sn, message: login.message || `Connected to ${login.sn || 'terminal'}` });
    } catch (err) {
      res.status(502).json({ ok: false, message: err instanceof Error ? err.message : 'Device unreachable' });
    }
  });

  router.get('/users', async (_req, res) => {
    try {
      const host = await ensureReachableHost();
      if (!host) {
        res.json({ users: [], offline: true });
        return;
      }
      const hik = await useHikvision();
      const users = hik ? await hikvision.getUserList() : await ai806.getUserList({ fresh: true });
      res.json({ users, offline: false });
    } catch (err) {
      res.json({
        users: [],
        offline: true,
        error: err instanceof Error ? err.message : 'Failed to read users',
      });
    }
  });

  router.get('/logs', async (_req, res) => {
    try {
      const host = await ensureReachableHost();
      if (!host) {
        res.json({ logs: [], offline: true });
        return;
      }
      res.json({ logs: await ai806.getLogs(), offline: false });
    } catch (err) {
      res.json({
        logs: [],
        offline: true,
        error: err instanceof Error ? err.message : 'Failed to read logs',
      });
    }
  });

  router.get('/rtlog', async (_req, res) => {
    try {
      const host = await ensureReachableHost();
      if (!host) {
        res.json({ logs: [], offline: true });
        return;
      }
      res.json({ logs: await ai806.getRtLogs(), offline: false });
    } catch (err) {
      res.json({
        logs: [],
        offline: true,
        error: err instanceof Error ? err.message : 'Failed to read live logs',
      });
    }
  });

  router.post('/unlock', async (_req, res) => {
    try {
      const result = (await useHikvision()) ? await hikvision.openDoor() : await ai806.openDoor();
      res.status(result.ok ? 200 : 400).json(result);
    } catch (err) {
      res.status(502).json({ ok: false, message: err instanceof Error ? err.message : 'Unlock failed' });
    }
  });

  router.post('/users', async (req, res) => {
    try {
      const payload = {
        enrollid: String(req.body.enrollid ?? ''),
        name: String(req.body.name ?? ''),
        admin: req.body.admin,
        department: req.body.department,
        shiftid: req.body.shiftid ?? req.body.shift,
        pwd: req.body.pwd,
        card: req.body.card,
        weekzone: req.body.weekzone,
        group: req.body.group,
        access_times: req.body.access_times,
        verifymode: req.body.verifymode,
        birthday: req.body.birthday,
        starttime: req.body.starttime,
        endtime: req.body.endtime,
      };
      const ok = (await useHikvision()) ? await hikvision.setUser(payload) : await ai806.setUser(payload);
      res.json({ ok });
    } catch (err) {
      res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Push failed' });
    }
  });

  router.get('/users/:id', async (req, res) => {
    try {
      const user = (await useHikvision())
        ? await hikvision.getUserInfo(req.params.id)
        : await ai806.getUserInfo(req.params.id);
      res.json({ user });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Failed to read user' });
    }
  });

  router.delete('/users/:id', async (req, res) => {
    try {
      const ok = (await useHikvision())
        ? await hikvision.deleteUser(req.params.id)
        : await ai806.deleteUser(req.params.id);
      res.json({ ok });
    } catch (err) {
      res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Delete failed' });
    }
  });

  router.post('/reg-status', async (_req, res) => {
    try {
      res.json(await ai806.checkRegStatus());
    } catch (err) {
      res.status(502).json({ result: false, error: err instanceof Error ? err.message : 'Status failed' });
    }
  });

  router.post('/enroll-face', async (req, res) => {
    try {
      const enrollid = String(req.body.enrollid ?? '');
      const name = String(req.body.name ?? '');
      const backupnum = Number(req.body.backupnum ?? 50);
      const replace = Boolean(req.body.replace);
      res.json(await ai806.startEnroll(enrollid, name, backupnum, {
        replace,
        skipSetUser: Boolean(req.body.skipSetUser),
      }));
    } catch (err) {
      res.status(502).json({ ok: false, message: err instanceof Error ? err.message : 'Enroll failed' });
    }
  });

  router.get('/info', async (_req, res) => {
    const wifi = wifiFollowStatus();
    try {
      const login = await ai806.login();
      const info = login.ok ? await ai806.getDeviceInfo() : {};
      res.json({
        ...publicDeviceAuth(),
        scanning: wifi.scanning,
        deviceOnline: Boolean(login.ok && wifi.deviceOnline),
        login,
        info,
      });
    } catch (err) {
      res.json({
        ...publicDeviceAuth(),
        scanning: wifi.scanning,
        deviceOnline: false,
        login: { ok: false, message: err instanceof Error ? err.message : 'Device unreachable' },
        info: {},
      });
    }
  });

  router.post('/time', async (_req, res) => {
    try {
      res.json(await ai806.syncTime());
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Sync time failed' });
    }
  });

  router.post('/clean-logs', async (_req, res) => {
    try {
      res.json(await ai806.cleanLogs());
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Clear logs failed' });
    }
  });

  router.post('/command', async (req, res) => {
    try {
      const cmd = String(req.body.cmd ?? '').trim();
      if (!cmd) {
        res.status(400).json({ error: 'Missing cmd' });
        return;
      }
      res.json(await ai806.command({ ...req.body, cmd }));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Command failed' });
    }
  });

  router.get('/schedules', (_req, res) => {
    res.json(loadSchedules());
  });

  router.put('/schedules', (req, res) => {
    res.json(saveSchedules(req.body as DeviceSchedules));
  });

  router.post('/schedules/push', async (req, res) => {
    const kind = String(req.body.kind ?? '');
    const data = loadSchedules();
    const cmds: Record<string, Record<string, unknown>> = {
      shift: { cmd: 'setshift', record: data.shifts },
      holiday: { cmd: 'setholiday', record: data.holidays },
      bell: { cmd: 'setbell', record: data.bells },
      question: { cmd: 'setquestion', ...data.question },
    };
    const body = cmds[kind];
    if (!body) {
      res.status(400).json({ error: 'Unknown schedule kind' });
      return;
    }
    try {
      res.json(await ai806.command(body));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Send to device failed' });
    }
  });

  router.get('/photo', async (req, res) => {
    let path = String(req.query.path ?? '');
    if (path && !path.startsWith('/')) path = `/${path}`;
    if (!path.startsWith('/photos/') && !path.startsWith('/photo/')) {
      res.status(400).json({ error: 'Invalid photo path' });
      return;
    }
    try {
      const host = await ensureReachableHost();
      if (!host) {
        res.status(502).json({ error: 'Terminal not on this Wi‑Fi' });
        return;
      }
      const page = await fetch(`http://${host}${path}`, { signal: AbortSignal.timeout(8000) });
      res.status(page.status);
      res.setHeader('Content-Type', page.headers.get('content-type') || 'image/jpeg');
      res.send(Buffer.from(await page.arrayBuffer()));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Photo failed' });
    }
  });

  return router;
}
