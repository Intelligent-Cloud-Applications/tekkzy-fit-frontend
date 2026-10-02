/**
 * Official HTTP JSON API used by the terminal's own web UI
 * (AI Biometric Device Management System).
 *
 * Commands are taken from the device pages (home.html, userlist.html,
 * logview.html, rtlogview.html, add_member.html). This is not an invented protocol.
 */
import { loadDeviceAuth } from './deviceAuth';
import { ensureReachableHost } from './discoverLan';
import { markDeviceOnline } from './wifiFollow';

export interface DeviceUserRow {
  id: string;
  name: string;
  department?: string;
  shift?: string | number;
  admin?: string | number;
  fingerprint?: string | number;
  palm?: string | number;
  face?: string | number;
  faceflag?: string | number;
  password?: string | number;
  card?: string | number;
  weekzone?: string | number;
  group?: string | number;
  access_times?: string | number;
  verifymode?: string | number;
  birthday?: string;
  starttime?: string;
  endtime?: string;
  photourl?: string;
}

export interface DeviceUserInput {
  enrollid: string | number;
  name: string;
  admin?: string | number;
  department?: string;
  shiftid?: string | number;
  pwd?: string | number;
  card?: string | number;
  weekzone?: string | number;
  group?: string | number;
  access_times?: string | number;
  verifymode?: string | number;
  birthday?: string;
  starttime?: string;
  endtime?: string;
}

export interface DeviceLogRow {
  enrollid: string | number;
  name?: string;
  time?: string;
  mode?: string | number;
  inout?: string | number;
  event?: string | number;
  note?: string;
  photourl?: string;
}

export interface DeviceInfo {
  sn?: string;
  result?: boolean;
  [key: string]: unknown;
}

interface JsonRecord {
  result?: boolean;
  ret?: string;
  msg?: string;
  reason?: number;
  sn?: string;
  record?: unknown;
  count?: number;
  to?: number;
  [key: string]: unknown;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Ai806Client {
  private userListCache: { at: number; rows: DeviceUserRow[] } | null = null;
  private userListInFlight: Promise<DeviceUserRow[]> | null = null;
  private gate = Promise.resolve();
  private writesWaiting = 0;
  private enrollPoll: ReturnType<typeof setInterval> | null = null;
  private enrollTickBusy = false;
  private lastReg: JsonRecord | null = null;
  private lastRegAt = 0;

  private auth() {
    return loadDeviceAuth();
  }

  configured(): boolean {
    const a = this.auth();
    return Boolean(a.host && a.password);
  }

  private exclusive<T>(fn: () => Promise<T>, write = false): Promise<T> {
    if (write) this.writesWaiting += 1;
    const run = this.gate.then(fn, fn);
    this.gate = run.then(() => undefined, () => undefined);
    return run.finally(() => {
      if (write) this.writesWaiting -= 1;
    });
  }

  private busy(): boolean {
    return this.writesWaiting > 0;
  }

  private async send(body: Record<string, unknown>, timeoutMs = 8_000): Promise<JsonRecord> {
    // Prefer the saved IP first; only scan if that probe fails.
    let host = await ensureReachableHost();
    const { password } = this.auth();
    if (!host) {
      throw new Error('No saved terminal IP. Open Settings → Terminal and save the device address.');
    }
    if (!password) throw new Error('Device web password is not set. Save it in Settings → Devices.');
    let last: Error | undefined;
    const tries = timeoutMs < 4_000 ? 1 : 2;
    for (let attempt = 0; attempt < tries; attempt += 1) {
      try {
        const res = await fetch(`http://${host}/api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, ...body }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) throw new Error(`Device HTTP ${res.status}`);
        markDeviceOnline(true);
        return (await res.json()) as JsonRecord;
      } catch (err) {
        last = err instanceof Error ? err : new Error('Terminal is busy. Try again.');
        if (attempt < tries - 1) {
          await sleep(400);
          // Re-probe saved IP before allowing a wider scan.
          host = await ensureReachableHost({ full: false }) || host;
        }
      }
    }
    throw last?.message && /Device HTTP/.test(last.message)
      ? last
      : new Error('Terminal is busy. Try again.');
  }

  private post(body: Record<string, unknown>, write = false, timeoutMs?: number): Promise<JsonRecord> {
    return this.exclusive(() => this.send(body, timeoutMs), write);
  }

  async login(): Promise<{ ok: boolean; sn?: string; message: string }> {
    const host = await ensureReachableHost();
    const { username, password } = this.auth();
    if (!password) {
      return { ok: false, message: 'Set device IP and web password in Settings → Devices.' };
    }
    if (!host) {
      return { ok: false, message: 'No saved terminal IP. Open Settings → Terminal and save the device address.' };
    }
    try {
      const res = await fetch(`http://${host}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'login', username, password, rememberMe: false }),
        signal: AbortSignal.timeout(12000),
      });
      const json = (await res.json()) as JsonRecord;
      if (json.result === true && json.ret === 'login') {
        markDeviceOnline(true);
        return { ok: true, sn: json.sn, message: `Connected to ${json.sn ?? host}` };
      }
      return { ok: false, sn: json.sn, message: String(json.msg ?? 'Login failed') };
    } catch {
      const next = await ensureReachableHost();
      if (next && next !== host) return this.login();
      return { ok: false, message: 'Terminal is busy. Try again.' };
    }
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const json = await this.post({ cmd: 'getdevinfo' });
    return json;
  }

  async register(): Promise<DeviceInfo> {
    return this.post({ cmd: 'reg' });
  }

  async openDoor(): Promise<{ ok: boolean; message: string }> {
    const json = await this.post({ cmd: 'opendoor' });
    return {
      ok: json.ret === 'opendoor' && json.result === true,
      message: String(json.msg ?? (json.result ? 'Door opened' : 'Unlock failed')),
    };
  }

  private async waitForWrites(ms = 8_000) {
    const start = Date.now();
    while (this.busy() && Date.now() - start < ms) {
      await sleep(200);
    }
  }

  async getUserList(opts?: { fresh?: boolean }): Promise<DeviceUserRow[]> {
    if (
      !opts?.fresh
      && this.userListCache
      && this.userListCache.rows.length
      && Date.now() - this.userListCache.at < 120_000
    ) {
      return this.userListCache.rows;
    }
    if (this.userListInFlight) return this.userListInFlight;
    this.userListInFlight = this.fetchUserList()
      .then((rows) => {
        if (rows.length) this.userListCache = { at: Date.now(), rows };
        return rows;
      })
      .finally(() => {
        this.userListInFlight = null;
      });
    return this.userListInFlight;
  }

  private pushUserRow(seen: Set<string>, rows: DeviceUserRow[], item: Record<string, unknown>) {
    const id = String(item.id ?? item.enrollid ?? item.userid ?? '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    rows.push({
      id,
      name: String(item.name ?? `User ${id}`),
      department: item.department != null ? String(item.department) : '',
      shift: item.shift as string | number | undefined,
      admin: item.admin as string | number | undefined,
      fingerprint: item.fingerprint as string | number | undefined,
      palm: item.palm as string | number | undefined,
      face: item.face as string | number | undefined,
      password: item.password as string | number | undefined,
      card: item.card as string | number | undefined,
      weekzone: item.weekzone as string | number | undefined,
      group: item.group as string | number | undefined,
      access_times: item.access_times as string | number | undefined,
      verifymode: item.verifymode as string | number | undefined,
      birthday: item.birthday != null ? String(item.birthday) : '',
      starttime: item.starttime != null ? String(item.starttime) : '',
      endtime: item.endtime != null ? String(item.endtime) : '',
      photourl: item.photourl != null ? String(item.photourl) : '',
    });
    return true;
  }

  private async fetchUserList(): Promise<DeviceUserRow[]> {
    await this.waitForWrites(15_000);
    const seen = new Set<string>();
    const rows: DeviceUserRow[] = [];
    // Official getuserlist uses stn as the start index (0-based on the device web UI).
    // ~8–10 users per page → 900 members needs ~100+ pages. Cap high enough for large gyms.
    let stn = 0;
    let reportedCount = 0;
    for (let i = 0; i < 300; i += 1) {
      if (this.busy()) await this.waitForWrites(15_000);
      let json: JsonRecord;
      try {
        json = await this.post({ cmd: 'getuserlist', stn }, false, 20_000);
      } catch (err) {
        // Keep a partial roster rather than failing the whole copy as "busy".
        if (rows.length) break;
        throw err;
      }
      const raw = json.record;
      const batch = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<Record<string, unknown>>;
      let added = 0;
      for (const item of batch) {
        if (this.pushUserRow(seen, rows, item)) added += 1;
      }
      if (i === 0 && rows.length === 0 && stn === 0) {
        stn = 1;
        continue;
      }
      reportedCount = Number(json.count ?? reportedCount) || reportedCount;
      const to = Number(json.to ?? 0);
      if (reportedCount > 0 && (rows.length >= reportedCount || to + 1 >= reportedCount)) break;
      const morePages = json.to !== undefined && reportedCount > 0 && to + 1 < reportedCount;
      const fullPage = added > 0 && batch.length >= 8;
      if (!morePages && !fullPage) break;
      const next = to > 0 || json.to !== undefined ? to + 1 : stn + Math.max(batch.length, 1);
      if (next <= stn) break;
      stn = next;
      // Give the terminal a breath between pages on large rosters.
      if (i > 0 && i % 10 === 0) await sleep(150);
    }

    // Only probe missing IDs on tiny rosters. For 800+ users, probing hammers the device ("busy").
    if (reportedCount > rows.length && reportedCount <= 40) {
      const maxId = Math.max(0, ...rows.map((r) => Number(r.id) || 0));
      const ceiling = Math.min(Math.max(maxId + 5, reportedCount), 60);
      let probed = 0;
      for (let id = 1; id <= ceiling && probed < 12; id += 1) {
        if (this.busy()) break;
        if (seen.has(String(id))) continue;
        probed += 1;
        const extra = await this.getUserInfo(id).catch(() => null);
        if (!extra?.id) continue;
        seen.add(String(extra.id));
        rows.push({
          ...extra,
          name: extra.name || `User ${extra.id}`,
        });
      }
    }
    return rows;
  }

  async getLogs(index = 0): Promise<DeviceLogRow[]> {
    const rows: DeviceLogRow[] = [];
    let cursor = index;
    for (let i = 0; i < 40; i += 1) {
      if (this.busy()) break;
      const json = await this.post({ cmd: 'getlog', index: cursor });
      const batch = Array.isArray(json.record) ? (json.record as DeviceLogRow[]) : [];
      rows.push(...batch);
      const count = Number(json.count ?? 0);
      const to = Number(json.to ?? 0);
      if (!(count > to)) break;
      cursor = to + 1;
    }
    return rows;
  }

  async getRtLogs(index = 0): Promise<DeviceLogRow[]> {
    if (this.busy()) return [];
    const json = await this.post({ cmd: 'getrtlog', index });
    if (!json.count) return [];
    return Array.isArray(json.record) ? (json.record as DeviceLogRow[]) : [];
  }

  async command(body: Record<string, unknown>): Promise<JsonRecord> {
    return this.post(body);
  }

  async getUserInfo(enrollid: string | number): Promise<DeviceUserRow | null> {
    const json = await this.post({ cmd: 'getuserinfo', enrollid: Number(enrollid) || enrollid });
    if (json.result === false) return null;
    const raw = json.record;
    const item = (Array.isArray(raw) ? raw[0] : raw && typeof raw === 'object' ? raw : json) as Record<string, unknown>;
    const id = String(item.id ?? item.enrollid ?? enrollid);
    if (!id) return null;
    return {
      id,
      name: String(item.name ?? ''),
      department: item.department != null ? String(item.department) : '',
      shift: item.shift as string | number | undefined,
      admin: item.admin as string | number | undefined,
      fingerprint: item.fingerprint as string | number | undefined,
      face: item.face as string | number | undefined,
      faceflag: item.faceflag as string | number | undefined,
      password: item.password as string | number | undefined,
      card: item.card as string | number | undefined,
      weekzone: item.weekzone as string | number | undefined,
      group: item.group as string | number | undefined,
      access_times: item.access_times as string | number | undefined,
      verifymode: item.verifymode as string | number | undefined,
      birthday: item.birthday != null ? String(item.birthday) : '',
      starttime: item.starttime != null ? String(item.starttime) : '',
      endtime: item.endtime != null ? String(item.endtime) : '',
      photourl: String(item.photourl ?? item.photo ?? ''),
    };
  }

  async deleteUser(enrollid: string | number, backupnum = 13): Promise<boolean> {
    // backupnum 13 = whole person; 50 = face; 0 = fingerprint; 11 = card
    const json = await this.post({
      cmd: 'deleteuser',
      enrollid: Number(enrollid) || enrollid,
      backupnum,
    }, true);
    if (json.result === true) return true;
    throw new Error(json.msg || `Terminal rejected delete (reason ${json.reason ?? 'unknown'}).`);
  }

  async setUser(input: DeviceUserInput | string, name?: string): Promise<boolean> {
    const row: DeviceUserInput = typeof input === 'string' ? { enrollid: input, name: name ?? '' } : input;
    const json = await this.post({
      cmd: 'setuserinfo',
      enrollid: Number(row.enrollid) || row.enrollid,
      name: row.name,
      admin: Number(row.admin ?? 0),
      department: row.department ?? '',
      shiftid: Number(row.shiftid ?? 0),
      pwd: row.pwd ?? 0,
      card: row.card ?? 0,
      weekzone: Number(row.weekzone ?? 0),
      zoneid: Number(row.weekzone ?? 0),
      group: Number(row.group ?? 0),
      groupid: Number(row.group ?? 0),
      access_times: Number(row.access_times ?? 0),
      verifymode: row.verifymode ?? 0,
      birthday: row.birthday ?? '',
      starttime: row.starttime ?? '',
      endtime: row.endtime ?? '',
    }, true);
    return json.result === true;
  }

  async startEnroll(
    enrollid: string | number,
    name: string,
    backupnum = 50,
    opts?: { replace?: boolean; skipSetUser?: boolean },
  ): Promise<{ ok: boolean; message: string }> {
    this.stopEnrollPoll();
    const kind = backupnum === 50 ? 'face' : backupnum === 11 ? 'card' : 'fingerprint';
    const existing = opts?.replace
      ? await this.getUserInfo(enrollid).catch(() => null)
      : null;
    const alreadyHas = Boolean(existing && (
      backupnum === 50 ? Number(existing.face || existing.faceflag) > 0
        : backupnum === 11 ? Boolean(existing.card && String(existing.card) !== '0')
          : Number(existing.fingerprint) > 0
    ));

    if (alreadyHas && !opts?.replace) {
      return {
        ok: false,
        message: `Device ID ${enrollid} already has a ${kind} (${existing?.name || 'existing user'}). Use a new ID, or edit that member.`,
      };
    }

    if (alreadyHas && opts?.replace) {
      try {
        await this.post({ cmd: 'deleteuserface', enrollid: Number(enrollid) || enrollid }, true);
      } catch {
        try {
          await this.deleteUser(enrollid, backupnum);
        } catch {
          /* adduser may still overwrite */
        }
      }
    }

    // Official add_member.html: setuserinfo first, then adduser flag 2, then checkregstatus.
    if (!opts?.skipSetUser) {
      await this.setUser({ enrollid, name: name || existing?.name || '', admin: 0 }).catch(() => false);
    }

    const payload = {
      cmd: 'adduser',
      flag: 2,
      backupnum,
      enrollid: Number(enrollid) || enrollid,
      ...(name || existing?.name ? { name: name || existing?.name } : {}),
    };
    let json = await this.post(payload, true);
    if (json.result === false && Number(json.reason) === 3) {
      await this.post({ cmd: 'adduser', cancel: true }, true).catch(() => undefined);
      json = await this.post(payload, true);
    }
    if (json.result === true) {
      this.startEnrollPoll();
      return {
        ok: true,
        message: kind === 'face'
          ? 'Terminal is waiting. Stand in front of the camera.'
          : `Terminal is waiting. Use the device to register the ${kind}.`,
      };
    }
    return {
      ok: false,
      message: json.msg
        || `Terminal rejected ${kind} enroll. Leave the device on the home screen and try again.`,
    };
  }

  async startFaceEnroll(enrollid: string | number, name: string): Promise<{ ok: boolean; message: string }> {
    return this.startEnroll(enrollid, name, 50);
  }

  private stopEnrollPoll() {
    if (this.enrollPoll) {
      clearInterval(this.enrollPoll);
      this.enrollPoll = null;
    }
  }

  private startEnrollPoll() {
    this.stopEnrollPoll();
    this.lastReg = null;
    this.lastRegAt = 0;
    const tick = async () => {
      if (this.enrollTickBusy) return;
      this.enrollTickBusy = true;
      try {
        const data = await this.exclusive(() => this.send({ cmd: 'checkregstatus' }, 2_000), false);
        this.lastReg = data;
        this.lastRegAt = Date.now();
        const status = Number(data.status);
        if (status === 100 || (Number.isFinite(status) && (status < 0 || status > 100))) {
          this.stopEnrollPoll();
        }
      } catch {
        /* keep last good status */
      } finally {
        this.enrollTickBusy = false;
      }
    };
    void tick();
    this.enrollPoll = setInterval(() => void tick(), 350);
  }

  /** Official add_member.html poll. status 0–99 = capturing, 100 = done. */
  async checkRegStatus(): Promise<JsonRecord> {
    const cacheMs = this.enrollPoll ? 150 : 2_500;
    if (this.lastReg && Date.now() - this.lastRegAt < cacheMs) {
      return this.lastReg;
    }
    const data = await this.post({ cmd: 'checkregstatus' }, false, 2_500);
    this.lastReg = data;
    this.lastRegAt = Date.now();
    const status = Number(data.status);
    if (status === 100 || (Number.isFinite(status) && (status < 0 || status > 100))) {
      this.stopEnrollPoll();
    }
    return data;
  }

  async syncTime(): Promise<JsonRecord> {
    const d = new Date();
    return this.post({
      cmd: 'settime',
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      hour: d.getHours(),
      min: d.getMinutes(),
      sec: d.getSeconds(),
    });
  }

  async cleanLogs(): Promise<JsonRecord> {
    return this.post({ cmd: 'cleanlog' });
  }
}

export const ai806 = new Ai806Client();
