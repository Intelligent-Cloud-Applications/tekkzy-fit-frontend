import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { Field, NativeSelect, TextInput } from '@/components/Field';
import { Modal } from '@/components/Modal';
import { FaceCapturePreview, type EnrollKind } from '@/components/FaceCapturePreview';
import { fetchLiveUserInfo, peekLiveUsers, startLiveFaceEnroll, waitForDeviceEnroll } from '@/services/liveDevice';
import { friendlyDeviceMessage } from '@/services/api';
import { todayISODate } from '@/lib/format';
import { saveMember } from '@/services/members';
import { addDays } from '@/services/memberships';
import { useUiStore } from '@/store/uiStore';
import type { Member } from '@shared/types';

export type MemberFormPayload = Parameters<typeof saveMember>[0] & { planId?: string };

type MemberHint = {
  id?: string;
  name?: string;
  deviceEnrollId?: string;
  memberCode?: string;
};

function enrollKey(member: MemberHint) {
  return String(member.deviceEnrollId || member.memberCode?.replace(/\D/g, '') || '').trim();
}

function nextEnrollId(members: MemberHint[]) {
  const nums = [
    ...members.map((m) => Number(enrollKey(m))),
    ...peekLiveUsers().map((u) => Number(String(u.id || ''))),
  ].filter((n) => Number.isFinite(n) && n > 0);
  return String((nums.length ? Math.max(...nums) : 0) + 1);
}

function memberUsingEnroll(members: MemberHint[], enrollid: string, exceptId?: string) {
  const taken = members.find((m) => enrollKey(m) === enrollid && m.id !== exceptId);
  if (taken) return taken;
  const live = peekLiveUsers().find((u) => String(u.id || '').trim() === enrollid);
  if (live) return { name: live.name, deviceEnrollId: String(live.id) };
  return undefined;
}

function dateInput(value?: string | null) {
  const day = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}

function isOnlineLocked(initial: Partial<Member> | null) {
  const row = initial as (Partial<Member> & { renewDateSource?: string | null; subscriptionId?: string }) | null;
  return Boolean(row?.renewDateSource === 'razorpay' || row?.subscriptionId);
}

function fromMember(initial: Partial<Member> | null, members: MemberHint[]) {
  const isEdit = Boolean(initial?.id);
  const nameParts = (initial?.name ?? '').trim().split(/\s+/);
  const startDate = initial?.joinDate || todayISODate();
  const cash = isEdit && !isOnlineLocked(initial);
  return {
    firstName: initial?.firstName || nameParts[0] || '',
    lastName: initial?.lastName || nameParts.slice(1).join(' ') || '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    gender: (initial?.gender === 'Female' || initial?.gender === 'Other' ? initial.gender : 'Male') as Member['gender'],
    dateOfBirth: initial?.dateOfBirth || '',
    address: initial?.address ?? '',
    city: initial?.city ?? 'Bengaluru',
    emergencyContactName: initial?.emergencyContactName ?? '',
    emergencyContactPhone: initial?.emergencyContactPhone ?? '',
    planId: 'plan-monthly',
    startDate,
    endDate: dateInput(initial?.renewDate || initial?.deviceEnd || (initial as { membership?: { expiryDate?: string } } | null)?.membership?.expiryDate),
    paymentMethod: (cash ? 'CASH' : 'ONLINE') as 'CASH' | 'ONLINE',
    notes: initial?.notes ?? '',
    deviceEnrollId:
      initial?.deviceEnrollId
      || (isEdit ? initial?.memberCode?.replace(/\D/g, '') || '' : '')
      || nextEnrollId(members),
    department: initial?.department ?? '',
    deviceShift: initial?.deviceShift ?? '1',
    devicePrivilege: initial?.devicePrivilege ?? '0',
    deviceCard: initial?.deviceCard ?? '0',
    deviceFingerprint: initial?.deviceFingerprint ?? '',
    devicePwd: initial?.devicePwd ?? '',
    deviceWeekzone: initial?.deviceWeekzone ?? '0',
    deviceGroup: initial?.deviceGroup ?? '0',
    deviceAccessTimes: initial?.deviceAccessTimes ?? '0',
    deviceVerifyMode: initial?.deviceVerifyMode ?? '0',
    deviceStart: initial?.deviceStart ?? '',
    deviceEnd: initial?.deviceEnd ?? '',
    devicePhotoUrl: initial?.devicePhotoUrl ?? '',
    faceRegistered: Boolean(initial?.faceRegistered),
    fingerRegistered: Boolean(initial?.deviceFingerprint && initial.deviceFingerprint !== '0'),
    cardRegistered: Boolean(initial?.deviceCard && initial.deviceCard !== '0'),
  };
}

const ENROLL_BACKUP: Record<EnrollKind, number> = { face: 50, finger: 0, card: 11 };

export function MemberFormModal({
  open,
  initial,
  plans,
  members = [],
  onClose,
  onSave,
}: {
  open: boolean;
  initial: Partial<Member> | null;
  plans: { id: string; name: string; durationDays?: number }[];
  members?: MemberHint[];
  onClose: () => void;
  onSave: (payload: MemberFormPayload) => Promise<void>;
}) {
  const toast = useUiStore((s) => s.pushToast);
  const isEdit = Boolean(initial?.id);
  const memberKey = initial?.id ?? 'new';
  const [form, setForm] = useState(() => fromMember(initial, members));
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<EnrollKind | null>(null);
  const [faceStatus, setFaceStatus] = useState('');
  const [liveImage, setLiveImage] = useState('');
  const [claimedEnroll, setClaimedEnroll] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(fromMember(initial, members));
    setPending(null);
    setLiveImage('');
    setClaimedEnroll(initial?.deviceEnrollId ?? '');
    setFaceStatus(initial?.faceRegistered || initial?.devicePhotoUrl ? 'Face on file from the terminal.' : '');
    // Only reseed when the modal opens or a different member is edited — not when the live list refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memberKey]);

  useEffect(() => {
    if (!open || isEdit || claimedEnroll) return;
    setForm((prev) => {
      const id = prev.deviceEnrollId.trim();
      if (!id || !memberUsingEnroll(members, id)) return prev;
      return { ...prev, deviceEnrollId: nextEnrollId(members) };
    });
  }, [open, isEdit, members, claimedEnroll]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function planEnd(start = form.startDate, planId = form.planId) {
    return addDays(start || todayISODate(), plans.find((p) => p.id === planId)?.durationDays || 30);
  }

  const cashEnd = !isOnlineLocked(initial) && (form.paymentMethod === 'CASH' || isEdit);
  const shownEnd = form.endDate || planEnd();

  function payload(): MemberFormPayload {
    const end = cashEnd ? shownEnd : form.deviceEnd;
    return {
      id: initial?.id,
      memberCode: initial?.memberCode ?? `MEM-${form.deviceEnrollId || Date.now().toString().slice(-6)}`,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      gender: form.gender,
      dateOfBirth: form.dateOfBirth || '1995-01-15',
      address: form.address,
      city: form.city,
      emergencyContactName: form.emergencyContactName,
      emergencyContactPhone: form.emergencyContactPhone,
      joinDate: form.startDate || initial?.joinDate || todayISODate(),
      startDate: form.startDate,
      status: initial?.status ?? 'ACTIVE',
      faceRegistered: form.faceRegistered,
      faceDeviceId: initial?.faceDeviceId,
      deviceEnrollId: form.deviceEnrollId.trim(),
      department: form.department,
      deviceShift: form.deviceShift,
      devicePrivilege: form.devicePrivilege,
      deviceCard: form.deviceCard,
      deviceFingerprint: form.deviceFingerprint,
      devicePwd: form.devicePwd,
      deviceWeekzone: form.deviceWeekzone,
      deviceGroup: form.deviceGroup,
      deviceAccessTimes: form.deviceAccessTimes,
      deviceVerifyMode: form.deviceVerifyMode,
      deviceStart: form.deviceStart,
      deviceEnd: end,
      renewDate: cashEnd ? shownEnd : initial?.renewDate,
      renewDateSource: cashEnd ? 'manual' : (initial as { renewDateSource?: string } | null)?.renewDateSource,
      deviceEndPending: cashEnd ? true : initial?.deviceEndPending,
      devicePhotoUrl: form.devicePhotoUrl,
      notes: form.notes,
      planId: form.planId,
      durationDays: plans.find((p) => p.id === form.planId)?.durationDays,
      paymentMethod: isEdit ? undefined : form.paymentMethod,
      sendPayLink: !isEdit && form.paymentMethod === 'ONLINE',
      skipPayment: !isEdit && form.paymentMethod === 'CASH',
    };
  }

  function memberName() {
    return `${form.firstName} ${form.lastName}`.trim() || (initial?.name ?? '').trim();
  }

  async function enroll(kind: EnrollKind) {
    if (pending) return;
    let enrollid = form.deviceEnrollId.trim();
    if (!enrollid) {
      enrollid = nextEnrollId(members);
      set('deviceEnrollId', enrollid);
    }
    const taken = memberUsingEnroll(members, enrollid, initial?.id);
    if (taken && !isEdit && claimedEnroll !== enrollid) {
      const next = nextEnrollId(members);
      set('deviceEnrollId', next);
      toast({
        kind: 'error',
        title: `Device ID ${enrollid} is already used by ${taken.name || taken.memberCode}`,
        message: `Use ${next} for a new member, or edit ${taken.name || 'that member'} to add their face.`,
      });
      return;
    }
    const name = memberName() || `Member ${enrollid}`;
    if (!form.firstName.trim() && name) {
      set('firstName', name.split(/\s+/)[0] ?? name);
    }
    const backupnum = ENROLL_BACKUP[kind];
    setPending(kind);
    setFaceStatus(
      kind === 'finger' ? 'Place a finger on the terminal sensor.' : kind === 'card' ? 'Tap the card on the terminal.' : 'Look at the terminal camera now.',
    );
    try {
      const r = await startLiveFaceEnroll(enrollid, name, backupnum, isEdit || Boolean(claimedEnroll));
      if (!r.ok) {
        toast({ kind: 'error', title: friendlyDeviceMessage(r.message || `Could not start ${kind}`) });
        return;
      }
      setFaceStatus(
        kind === 'finger' ? 'Place a finger on the terminal sensor.' : kind === 'card' ? 'Tap the card on the terminal.' : 'Look at the terminal camera now.',
      );
      setClaimedEnroll(enrollid);
      const captured = await waitForDeviceEnroll(enrollid, (p) => {
        setFaceStatus(p.status);
        if (p.image) setLiveImage(p.image);
      });
      if (!captured) {
        setFaceStatus(`No ${kind} yet. Try again on the terminal.`);
        toast({ kind: 'error', title: `${kind === 'face' ? 'Face' : kind === 'finger' ? 'Fingerprint' : 'Card'} was not captured.` });
        return;
      }
      setPending(null);
      if (kind === 'face') {
        set('devicePhotoUrl', captured.photourl || form.devicePhotoUrl);
        set('faceRegistered', true);
        set('deviceVerifyMode', '8');
        setFaceStatus('Face added on the terminal.');
      } else if (kind === 'finger') {
        set('deviceFingerprint', '1');
        set('fingerRegistered', true);
        if (!form.faceRegistered) set('deviceVerifyMode', '1');
        setFaceStatus('Fingerprint added on the terminal.');
      } else {
        const info = await fetchLiveUserInfo(enrollid).catch(() => ({ user: null }));
        const card = String(info.user?.card ?? form.deviceCard ?? '1');
        set('deviceCard', card && card !== '0' ? card : '1');
        set('cardRegistered', true);
        if (!form.faceRegistered) set('deviceVerifyMode', '2');
        setFaceStatus('Card added on the terminal.');
      }
      toast({ kind: 'success', title: kind === 'face' ? 'Face added' : kind === 'finger' ? 'Fingerprint added' : 'Card added' });
    } catch (e) {
      toast({ kind: 'error', title: friendlyDeviceMessage(e instanceof Error ? e.message : `Could not add ${kind}`) });
    } finally {
      setPending(null);
    }
  }

  function submitForm() {
    if (!form.firstName.trim() && !memberName()) {
      toast({ kind: 'error', title: 'Enter a first name' });
      return;
    }
    if (!form.phone.trim()) {
      toast({ kind: 'error', title: 'Enter a phone number' });
      return;
    }
    if (form.paymentMethod === 'ONLINE' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast({ kind: 'error', title: 'Enter a valid email so the subscription link can be sent' });
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        await onSave(payload());
        onClose();
      } catch (err) {
        toast({ kind: 'error', title: err instanceof Error ? err.message : 'Save failed' });
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit member' : 'Add member'}
      onClose={onClose}
      size="xl"
      footer={
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClose}>Cancel</Button>
          <Button type="button" className="w-full sm:w-auto" disabled={busy || Boolean(pending)} loading={busy} onClick={() => void submitForm()}>
            {busy ? 'Saving…' : isEdit ? 'Save' : 'Add member'}
          </Button>
        </div>
      }
    >
      {open ? (
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,20rem)] lg:items-start">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="First name">
                <TextInput value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required autoFocus />
              </Field>
              <Field label="Last name">
                <TextInput value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
              </Field>
              <Field label="Phone" className="col-span-2">
                <TextInput value={form.phone} onChange={(e) => set('phone', e.target.value)} required inputMode="tel" />
              </Field>
              <Field label={form.paymentMethod === 'ONLINE' || isEdit ? 'Email' : 'Email (optional)'} className="col-span-2">
                <TextInput type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required={form.paymentMethod === 'ONLINE'} />
              </Field>
              {!isEdit ? (
                <Field label="Plan">
                  <NativeSelect
                    value={form.planId}
                    onChange={(e) => {
                      const planId = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        planId,
                        endDate: prev.paymentMethod === 'CASH' ? planEnd(prev.startDate, planId) : prev.endDate,
                      }));
                    }}
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </NativeSelect>
                </Field>
              ) : (
                <Field label="Gender">
                  <NativeSelect value={form.gender} onChange={(e) => set('gender', e.target.value as Member['gender'])}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </NativeSelect>
                </Field>
              )}
              {!isEdit ? (
                <Field label="Payment">
                  <NativeSelect
                    value={form.paymentMethod}
                    onChange={(e) => {
                      const method = e.target.value as 'CASH' | 'ONLINE';
                      setForm((prev) => ({
                        ...prev,
                        paymentMethod: method,
                        endDate: method === 'CASH' ? (prev.endDate || planEnd(prev.startDate, prev.planId)) : prev.endDate,
                      }));
                    }}
                  >
                    <option value="CASH">Cash</option>
                    <option value="ONLINE">Online</option>
                  </NativeSelect>
                </Field>
              ) : (
                <>
                  <Field label="Device ID">
                    <TextInput
                      value={form.deviceEnrollId}
                      onChange={(e) => set('deviceEnrollId', e.target.value)}
                      disabled={Boolean(pending) || Boolean(claimedEnroll)}
                    />
                  </Field>
                  <Field label="End date (dd/mm/yyyy)">
                    <TextInput
                      type="date"
                      min={form.startDate || todayISODate()}
                      value={shownEnd || form.endDate}
                      readOnly={!cashEnd}
                      disabled={!cashEnd}
                      onChange={(e) => set('endDate', e.target.value)}
                    />
                  </Field>
                </>
              )}
              {!isEdit ? (
                <>
                  <Field label="Start date">
                    <TextInput
                      type="date"
                      min={todayISODate()}
                      value={form.startDate}
                      onChange={(e) => {
                        const startDate = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          startDate,
                          endDate: prev.paymentMethod === 'CASH' ? planEnd(startDate, prev.planId) : prev.endDate,
                        }));
                      }}
                    />
                  </Field>
                  <Field label="End date (dd/mm/yyyy)">
                    <TextInput
                      type="date"
                      min={form.startDate || todayISODate()}
                      value={shownEnd}
                      readOnly={!cashEnd}
                      disabled={!cashEnd}
                      onChange={(e) => set('endDate', e.target.value)}
                    />
                  </Field>
                  <p className="col-span-2 text-[11px] text-ink-soft">
                    {cashEnd
                      ? 'Cash at the desk — you can set the end date. It is pushed to the terminal when you save.'
                      : 'Online subscriptions follow the plan. Razorpay sets the end date, so it cannot be edited here.'}
                  </p>
                  <Field label="Device ID" className="col-span-2">
                    <TextInput
                      value={form.deviceEnrollId}
                      onChange={(e) => set('deviceEnrollId', e.target.value)}
                      disabled={Boolean(pending) || Boolean(claimedEnroll)}
                    />
                  </Field>
                </>
              ) : null}
            </div>

            <details className="rounded-xl border border-line">
              <summary className="cursor-pointer list-none px-3 py-2 text-[12px] font-semibold text-ink hover:bg-[var(--hover-fill)]">
                More details
              </summary>
              <div className="grid grid-cols-2 gap-2.5 border-t border-line p-3 xl:grid-cols-3">
                <Field label="Birthday">
                  <TextInput type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
                </Field>
                <Field label="Gender">
                  <NativeSelect value={form.gender} onChange={(e) => set('gender', e.target.value as Member['gender'])}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </NativeSelect>
                </Field>
                <Field label="City">
                  <TextInput value={form.city} onChange={(e) => set('city', e.target.value)} />
                </Field>
                <Field label="Address" className="col-span-2 xl:col-span-1">
                  <TextInput value={form.address} onChange={(e) => set('address', e.target.value)} />
                </Field>
                <Field label="Emergency name">
                  <TextInput value={form.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} />
                </Field>
                <Field label="Emergency phone">
                  <TextInput value={form.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone', e.target.value)} />
                </Field>
                <Field label="Shift">
                  <TextInput value={form.deviceShift} onChange={(e) => set('deviceShift', e.target.value)} />
                </Field>
                <Field label="Card">
                  <TextInput value={form.deviceCard} onChange={(e) => set('deviceCard', e.target.value)} />
                </Field>
                <Field label="Verify mode">
                  <NativeSelect value={form.deviceVerifyMode} onChange={(e) => set('deviceVerifyMode', e.target.value)}>
                    <option value="0">Device</option>
                    <option value="8">Face</option>
                    <option value="1">Fingerprint</option>
                    <option value="2">Card</option>
                    <option value="3">Password</option>
                  </NativeSelect>
                </Field>
                <Field label="Notes" className="col-span-2 xl:col-span-1">
                  <TextInput value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                </Field>
              </div>
            </details>
          </div>

          <FaceCapturePreview
            enrollid={form.deviceEnrollId}
            photourl={form.devicePhotoUrl}
            waiting={Boolean(pending)}
            liveImage={liveImage}
            pending={pending}
            marks={{
              face: form.faceRegistered,
              finger: form.fingerRegistered,
              card: form.cardRegistered,
            }}
            status={faceStatus || (memberName() ? memberName() : 'Enter a name first')}
            onEnroll={(kind) => void enroll(kind)}
          />
        </div>
      ) : null}
    </Modal>
  );
}
