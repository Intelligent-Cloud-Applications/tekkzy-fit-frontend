import { useState } from 'react';
import { Button } from '@/components/Button';
import { FaceCapturePreview, type EnrollKind } from '@/components/FaceCapturePreview';
import { Field, NativeSelect, TextArea, TextInput } from '@/components/Field';
import { fetchLiveUserInfo, pushLiveUser, startLiveFaceEnroll, waitForDeviceEnroll, type LiveUser } from '@/services/liveDevice';
import { useUiStore } from '@/store/uiStore';

const empty = {
  enrollid: '',
  name: '',
  department: '',
  pwd: '',
  card: '0',
  admin: '0',
  shiftid: '1',
  weekzone: '0',
  group: '0',
  access_times: '0',
  verifymode: '0',
  birthday: '',
  starttime: '',
  endtime: '',
  profile: '',
  photourl: '',
};

const ENROLL_BACKUP: Record<EnrollKind, number> = { face: 50, finger: 0, card: 11 };

export function AddUserPanel({ seed, onSaved, onCancel }: { seed?: LiveUser | null; onSaved: () => void; onCancel?: () => void }) {
  const toast = useUiStore((s) => s.pushToast);
  const [form, setForm] = useState(() =>
    seed
      ? {
          ...empty,
          enrollid: seed.id,
          name: seed.name,
          department: seed.department ?? '',
          pwd: String(seed.password ?? ''),
          card: String(seed.card ?? '0'),
          admin: String(seed.admin ?? '0'),
          shiftid: String(seed.shift ?? '1'),
          weekzone: String(seed.weekzone ?? '0'),
          group: String(seed.group ?? '0'),
          access_times: String(seed.access_times ?? '0'),
          verifymode: String(seed.verifymode ?? '0'),
          birthday: seed.birthday ?? '',
          starttime: seed.starttime ?? '',
          endtime: seed.endtime ?? '',
          photourl: seed.photourl ?? '',
        }
      : empty,
  );
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<EnrollKind | null>(null);
  const [faceStatus, setFaceStatus] = useState('');
  const [liveImage, setLiveImage] = useState('');
  const [fingerImage, setFingerImage] = useState('');
  const [marks, setMarks] = useState({
    face: Boolean(Number(seed?.face)),
    finger: Boolean(Number(seed?.fingerprint)),
    card: Boolean(seed?.card && String(seed.card) !== '0'),
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function send() {
    if (!form.enrollid || !form.name) {
      toast({ kind: 'error', title: 'ID and name are required' });
      return;
    }
    setBusy(true);
    try {
      const ok = await pushLiveUser(form);
      toast({ kind: ok.ok ? 'success' : 'error', title: ok.ok ? 'Sent to device' : 'Device rejected the user' });
      if (ok.ok) onSaved();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof Error ? e.message : 'Send failed' });
    } finally {
      setBusy(false);
    }
  }

  async function enroll(kind: EnrollKind) {
    if (pending) return;
    if (!form.enrollid || !form.name) {
      toast({ kind: 'error', title: 'Save ID and name first' });
      return;
    }
    if (kind === 'finger' && marks.face) {
      toast({ kind: 'error', title: 'This person already has a face. The terminal keeps one biometric.' });
      return;
    }
    if (kind === 'face' && marks.finger) {
      toast({ kind: 'error', title: 'This person already has a fingerprint. The terminal keeps one biometric.' });
      return;
    }
    setPending(kind);
    setFaceStatus(
      kind === 'finger' ? 'Place a finger on the terminal sensor.' : kind === 'card' ? 'Tap the card on the terminal.' : 'Look at the terminal camera now.',
    );
    try {
      const r = await startLiveFaceEnroll(form.enrollid, form.name, ENROLL_BACKUP[kind], Boolean(marks[kind]));
      if (!r.ok) {
        toast({ kind: 'error', title: r.message || `Could not start ${kind}` });
        return;
      }
      const captured = await waitForDeviceEnroll(form.enrollid, (p) => {
        setFaceStatus(p.status);
        if (p.image) {
          if (kind === 'finger') setFingerImage(p.image);
          else if (kind === 'face') setLiveImage(p.image);
        }
      }, 90_000, kind);
      if (!captured) {
        setFaceStatus(`No ${kind} yet. Try again on the terminal.`);
        toast({ kind: 'error', title: 'Not captured. Try again on the device.' });
        return;
      }
      setPending(null);
      if (kind === 'face') {
        set('photourl', captured.photourl || form.photourl);
      } else if (kind === 'card') {
        const info = await fetchLiveUserInfo(form.enrollid).catch(() => ({ user: null }));
        if (info.user?.card) set('card', String(info.user.card));
      }
      setMarks((prev) => ({ ...prev, [kind]: true }));
      setFaceStatus(`${kind === 'face' ? 'Face' : kind === 'finger' ? 'Fingerprint' : 'Card'} added on the terminal.`);
      toast({ kind: 'success', title: 'Captured on the terminal' });
    } catch (e) {
      toast({ kind: 'error', title: e instanceof Error ? e.message : 'Enroll failed' });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid w-full grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-display text-lg font-bold">{seed ? 'Edit person' : 'Add person'}</div>
        {onCancel ? <Button variant="secondary" onClick={onCancel}>Back to list</Button> : null}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Device ID"><TextInput value={form.enrollid} onChange={(e) => set('enrollid', e.target.value)} /></Field>
        <Field label="Name"><TextInput value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Department"><TextInput value={form.department} onChange={(e) => set('department', e.target.value)} /></Field>
        <Field label="Shift"><TextInput value={form.shiftid} onChange={(e) => set('shiftid', e.target.value)} /></Field>
        <Field label="Role">
          <NativeSelect value={form.admin} onChange={(e) => set('admin', e.target.value)}>
            <option value="0">User</option>
            <option value="1">Admin</option>
          </NativeSelect>
        </Field>
        <Field label="Unlock with">
          <NativeSelect value={form.verifymode} onChange={(e) => set('verifymode', e.target.value)}>
            <option value="0">Device default</option>
            <option value="8">Face</option>
            <option value="1">Fingerprint</option>
            <option value="2">Card</option>
            <option value="3">Password</option>
          </NativeSelect>
        </Field>
      </div>
      <details className="rounded-xl border border-line">
        <summary className="cursor-pointer list-none px-3 py-2 text-[12px] font-semibold text-ink hover:bg-[var(--hover-fill)]">
          More device fields
        </summary>
        <div className="grid grid-cols-1 gap-3 border-t border-line p-3 sm:grid-cols-2">
          <Field label="Password"><TextInput value={form.pwd} onChange={(e) => set('pwd', e.target.value)} /></Field>
          <Field label="Card number"><TextInput value={form.card} onChange={(e) => set('card', e.target.value)} /></Field>
          <Field label="Time zone"><TextInput value={form.weekzone} onChange={(e) => set('weekzone', e.target.value)} /></Field>
          <Field label="Group"><TextInput value={form.group} onChange={(e) => set('group', e.target.value)} /></Field>
          <Field label="Access times"><TextInput value={form.access_times} onChange={(e) => set('access_times', e.target.value)} /></Field>
          <Field label="Birthday"><TextInput value={form.birthday} onChange={(e) => set('birthday', e.target.value)} placeholder="yyyy-mm-dd" /></Field>
          <Field label="Valid from"><TextInput value={form.starttime} onChange={(e) => set('starttime', e.target.value)} /></Field>
          <Field label="Valid until"><TextInput value={form.endtime} onChange={(e) => set('endtime', e.target.value)} /></Field>
          <Field label="Notes">
            <TextArea rows={3} value={form.profile} onChange={(e) => set('profile', e.target.value)} />
          </Field>
        </div>
      </details>
      <Button disabled={busy || Boolean(pending)} loading={busy} onClick={() => void send()}>{busy ? 'Saving…' : 'Save on device'}</Button>
    </div>
    <FaceCapturePreview
      enrollid={form.enrollid}
      photourl={form.photourl}
      waiting={Boolean(pending)}
      liveImage={liveImage}
      fingerImage={fingerImage}
      pending={pending}
      marks={marks}
      status={faceStatus}
      onEnroll={(kind) => void enroll(kind)}
    />
    </div>
  );
}
