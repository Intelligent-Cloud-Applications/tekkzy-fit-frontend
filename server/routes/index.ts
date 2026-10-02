import { Router } from 'express';
import { applyMembershipRules, checkAccess } from '../../shared/access/checkAccess';
import { DEMO_PASSWORD, demoUsers } from '../../src/data/demo';
import type { Member, Membership, Payment, User } from '../../shared/types';
import { db, persist } from '../database/store';
import { optionalAuth, requireAuth, signToken } from '../middleware/auth';
import { liveDeviceRouter } from './liveDevice';
import { cloudEnabled, cloudFor } from '../cloud/client';

function localStaffUser(email: string, password: string): User | null {
  const normalized = email.trim().toLowerCase();
  if (normalized === 'admin@tekkzy.com' && password === process.env.STAFF_ADMIN_PASSWORD) {
    return { id: 'staff-admin', name: 'Naresh Behera', email: normalized, role: 'SUPER_ADMIN', gymId: 'gym-1', avatarInitials: 'NB' };
  }
  if (normalized === 'manager@tekkzy.com' && password === process.env.STAFF_MANAGER_PASSWORD) {
    return { id: 'staff-manager', name: 'Manager', email: normalized, role: 'MANAGER', gymId: 'gym-1', avatarInitials: 'MG' };
  }
  return null;
}

export function apiRouter(): Router {
  const router = Router();
  router.use(optionalAuth);

  router.post('/auth/login', async (req, res, next) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (cloudEnabled()) {
        res.json(await cloudFor(req)('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }));
        return;
      }
      const staff = localStaffUser(String(email || ''), String(password || ''));
      const user = staff || demoUsers.find((u) => u.email === email);
      if (!user || (!staff && password !== DEMO_PASSWORD)) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }
      res.json({ token: signToken(user), user });
    } catch (err) {
      next(err);
    }
  });
  router.post('/auth/forgot', async (req, res, next) => {
    try {
      if (!cloudEnabled()) {
        res.status(400).json({ error: 'Password reset is available after the live API is connected.' });
        return;
      }
      res.json(await cloudFor(req)('/auth/forgot', { method: 'POST', body: JSON.stringify(req.body) }));
    } catch (err) {
      next(err);
    }
  });
  router.post('/auth/confirm-forgot', async (req, res, next) => {
    try {
      if (!cloudEnabled()) {
        res.status(400).json({ error: 'Password reset is available after the live API is connected.' });
        return;
      }
      res.json(await cloudFor(req)('/auth/confirm-forgot', { method: 'POST', body: JSON.stringify(req.body) }));
    } catch (err) {
      next(err);
    }
  });

  router.get('/members', requireAuth, async (req, res, next) => {
    try {
      if (cloudEnabled()) {
        res.json(await cloudFor(req)('/members'));
        return;
      }
      res.json(db().members);
    } catch (err) {
      next(err);
    }
  });
  router.get('/members/:id', requireAuth, async (req, res, next) => {
    try {
      if (cloudEnabled()) {
        res.json(await cloudFor(req)(`/members/${req.params.id}`));
        return;
      }
    const row = db().members.find((m) => m.id === req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(row);
    } catch (err) {
      next(err);
    }
  });
  router.post('/members', requireAuth, async (req, res, next) => {
    try {
      if (cloudEnabled()) {
        res.status(201).json(await cloudFor(req)('/members', { method: 'POST', body: JSON.stringify(req.body) }));
        return;
      }
      const member = req.body as Member;
      db().members.push(member);
      persist();
      res.status(201).json(member);
    } catch (err) {
      next(err);
    }
  });
  router.put('/members/:id', requireAuth, async (req, res, next) => {
    try {
      if (cloudEnabled()) {
        res.json(await cloudFor(req)(`/members/${req.params.id}`, { method: 'PUT', body: JSON.stringify(req.body) }));
        return;
      }
    const idx = db().members.findIndex((m) => m.id === req.params.id);
    if (idx < 0) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    db().members[idx] = req.body as Member;
    persist();
    res.json(db().members[idx]);
    } catch (err) {
      next(err);
    }
  });
  router.delete('/members/:id', requireAuth, async (req, res, next) => {
    try {
      if (cloudEnabled()) {
        const enroll = typeof req.query.enroll === 'string' ? req.query.enroll.trim() : '';
        const q = enroll ? `?enroll=${encodeURIComponent(enroll)}` : '';
        await cloudFor(req)(`/members/${req.params.id}${q}`, { method: 'DELETE' });
        res.status(204).end();
        return;
      }
      db().members = db().members.filter((m) => m.id !== req.params.id);
      persist();
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get('/memberships', requireAuth, (_req, res) => {
    res.json(db().memberships.map((m) => applyMembershipRules(m)));
  });
  router.post('/memberships', requireAuth, (req, res) => {
    const row = applyMembershipRules(req.body as Membership);
    db().memberships.push(row);
    persist();
    res.status(201).json(row);
  });
  router.put('/memberships/:id', requireAuth, (req, res) => {
    const idx = db().memberships.findIndex((m) => m.id === req.params.id);
    if (idx < 0) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    db().memberships[idx] = applyMembershipRules(req.body as Membership);
    persist();
    res.json(db().memberships[idx]);
  });
  router.post('/memberships/:id/renew', requireAuth, (req, res) => {
    const row = db().memberships.find((m) => m.id === req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const plan = db().plans.find((p) => p.id === row.planId);
    const days = plan?.durationDays ?? 30;
    const base = new Date(row.expiryDate) > new Date() ? new Date(row.expiryDate) : new Date();
    base.setDate(base.getDate() + days);
    row.expiryDate = base.toISOString().slice(0, 10);
    row.paymentStatus = 'PAID';
    Object.assign(row, applyMembershipRules(row));
    persist();
    res.json(row);
  });

  router.get('/attendance', requireAuth, (_req, res) => {
    res.json(db().attendance);
  });
  router.get('/attendance/today', requireAuth, (_req, res) => {
    const day = new Date().toISOString().slice(0, 10);
    res.json(db().attendance.filter((a) => a.timestamp.slice(0, 10) === day));
  });

  router.get('/payments', requireAuth, async (req, res, next) => {
    try {
      if (cloudEnabled()) {
        const q = req.query.memberId ? `?memberId=${encodeURIComponent(String(req.query.memberId))}` : '';
        res.json(await cloudFor(req)(`/payments${q}`));
        return;
      }
      res.json(db().payments);
    } catch (err) {
      next(err);
    }
  });
  router.post('/payments', requireAuth, async (req, res, next) => {
    try {
      if (cloudEnabled()) {
        res.status(201).json(await cloudFor(req)('/payments', { method: 'POST', body: JSON.stringify(req.body) }));
        return;
      }
      const payment = req.body as Payment;
      db().payments.push(payment);
      persist();
      res.status(201).json(payment);
    } catch (err) {
      next(err);
    }
  });
  router.get('/expenses', requireAuth, async (req, res, next) => {
    try {
      if (cloudEnabled()) {
        res.json(await cloudFor(req)('/expenses'));
        return;
      }
      res.json([]);
    } catch (err) {
      next(err);
    }
  });
  router.get('/expenses/:id', requireAuth, async (req, res, next) => {
    try {
      if (!cloudEnabled()) {
        res.status(404).json({ error: 'Expense not found' });
        return;
      }
      res.json(await cloudFor(req)(`/expenses/${req.params.id}`));
    } catch (err) {
      next(err);
    }
  });
  router.post('/expenses', requireAuth, async (req, res, next) => {
    try {
      if (!cloudEnabled()) {
        res.status(503).json({ error: 'Cloud expense API is not configured' });
        return;
      }
      res.status(201).json(await cloudFor(req)('/expenses', { method: 'POST', body: JSON.stringify(req.body) }));
    } catch (err) {
      next(err);
    }
  });
  router.put('/expenses/:id', requireAuth, async (req, res, next) => {
    try {
      if (!cloudEnabled()) {
        res.status(503).json({ error: 'Cloud expense API is not configured' });
        return;
      }
      res.json(await cloudFor(req)(`/expenses/${req.params.id}`, { method: 'PUT', body: JSON.stringify(req.body) }));
    } catch (err) {
      next(err);
    }
  });
  router.delete('/expenses/:id', requireAuth, async (req, res, next) => {
    try {
      if (!cloudEnabled()) {
        res.status(503).json({ error: 'Cloud expense API is not configured' });
        return;
      }
      await cloudFor(req)(`/expenses/${req.params.id}`, { method: 'DELETE' });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/payments/link', requireAuth, async (req, res, next) => {
    try {
      if (!cloudEnabled()) {
        res.status(503).json({ error: 'Cloud payment API is not configured' });
        return;
      }
      res.status(201).json(await cloudFor(req)('/payments', { method: 'POST', body: JSON.stringify(req.body) }));
    } catch (err) {
      next(err);
    }
  });

  router.use('/devices/live', liveDeviceRouter());

  router.get('/devices', requireAuth, (_req, res) => {
    res.json(db().devices);
  });
  router.get('/devices/:id/status', requireAuth, (req, res) => {
    const device = db().devices.find((d) => d.id === req.params.id);
    if (!device) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({
      deviceId: device.id,
      online: device.status === 'ONLINE',
      gateState: device.gateState,
      lastHeartbeat: device.lastHeartbeat,
    });
  });
  router.post('/devices/:id/sync', requireAuth, (req, res) => {
    res.json({ ok: true, deviceId: req.params.id, message: 'Queued mock member push' });
  });
  router.post('/devices/:id/unlock', requireAuth, (req, res) => {
    const device = db().devices.find((d) => d.id === req.params.id);
    if (device) device.gateState = 'UNLOCKED';
    persist();
    res.json({ ok: true, gateState: 'UNLOCKED' });
  });
  router.post('/devices/:id/lock', requireAuth, (req, res) => {
    const device = db().devices.find((d) => d.id === req.params.id);
    if (device) device.gateState = 'LOCKED';
    persist();
    res.json({ ok: true, gateState: 'LOCKED' });
  });

  router.post('/access/check', requireAuth, (req, res) => {
    const { memberId } = req.body as { memberId?: string };
    const member = db().members.find((m) => m.id === memberId);
    const membership = db().memberships.find((m) => m.memberId === memberId);
    const result = checkAccess({ member, membership: membership ? applyMembershipRules(membership) : undefined });
    res.json(result);
  });
  router.get('/access/events', requireAuth, (_req, res) => {
    res.json(db().accessEvents);
  });

  router.get('/settings', requireAuth, async (req, res, next) => {
    try {
      if (cloudEnabled()) {
        res.json(await cloudFor(req)('/settings'));
        return;
      }
      res.json(db().settings);
    } catch (err) {
      next(err);
    }
  });
  router.put('/settings', requireAuth, async (req, res, next) => {
    try {
      if (cloudEnabled()) {
        res.json(await cloudFor(req)('/settings', { method: 'PUT', body: JSON.stringify(req.body) }));
        return;
      }
      db().settings = req.body;
      persist();
      res.json(db().settings);
    } catch (err) {
      next(err);
    }
  });

  router.post('/sync/push', requireAuth, (req, res) => {
    db().syncQueue.push({
      id: `sync-${Date.now()}`,
      entity: String(req.body.entity ?? ''),
      entityId: String(req.body.entityId ?? ''),
      operation: req.body.operation ?? 'UPDATE',
      payload: JSON.stringify(req.body.data ?? {}),
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'SYNCED',
    });
    persist();
    res.json({ ok: true });
  });
  router.get('/sync/pull', requireAuth, (_req, res) => {
    res.json([
      { entity: 'members', records: db().members },
      { entity: 'memberships', records: db().memberships },
    ]);
  });

  return router;
}
