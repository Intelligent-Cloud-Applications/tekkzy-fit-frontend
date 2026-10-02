import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { attendanceBelongsToMember, fetchStaff, nextEnrollId, removeMember, resolveNextEnrollId, saveStaff } from '../api';
import { ConfirmDialog } from '../confirm';
import {
  fetchFacePreview,
  guessFacePhotoUrl,
  loginDevice,
  startDeviceEnroll,
  waitDeviceEnroll,
  withPhotoCacheBust,
  type EnrollKind,
} from '../device';
import { errorMessage } from '../errors';
import { feedbackAdded, feedbackDeleted } from '../feedback';
import { formatDate, formatTime, initials, splitName, todayISO, ymd } from '../format';
import { Icon } from '../icons';
import { useGym } from '../GymContext';
import { Hint, IconBtn, MetaRow, PageTitle, ScreenPad, SearchBox, SectionTitle, StatTile } from '../page';
import { loadDeviceCreds } from '../session';
import { AppSheet } from '../sheet';
import { pushToast } from '../toast';
import { useTheme } from '../theme';
import type { AttendanceRow, Member } from '../types';
import { Empty, ErrorText, Field, FieldGrid, FormField, StatusBadge } from '../ui';
import { FaceCapture } from './FaceCapture';

/** Permanent access on the terminal — no membership end date for staff. */
const STAFF_OPEN_END = '2037-12-31';
/** Matches the Cognito pool password policy. */
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const STAFF_ROLES = [
  { value: 'trainer', label: 'Trainer' },
  { value: 'front_desk', label: 'Front desk' },
  { value: 'other', label: 'Other' },
];

type StaffDay = { day: string; times: string[] };

function staffDays(row: Member, attendance: AttendanceRow[]): StaffDay[] {
  const days = new Map<string, string[]>();
  for (const [day, present] of Object.entries(row.attendanceDays || {})) {
    if (present && !days.has(day)) days.set(day, []);
  }
  for (const punch of attendance) {
    if (String(punch.status || 'GRANTED').toUpperCase() !== 'GRANTED') continue;
    if (!attendanceBelongsToMember(punch, row)) continue;
    const day = ymd(punch.timestamp);
    if (!day) continue;
    const times = days.get(day) || [];
    const time = formatTime(punch.timestamp);
    if (time && !times.includes(time)) times.push(time);
    days.set(day, times);
  }
  return [...days.entries()]
    .map(([day, times]) => ({ day, times: times.sort() }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

function addedByStaff(row: Member, members: Member[]) {
  const ids = new Set([row.loginSub, row.id, row.cognitoId].filter(Boolean) as string[]);
  return members
    .filter((m) => m.addedById && ids.has(m.addedById))
    .sort((a, b) => String(b.createdAt || b.joinDate || '').localeCompare(String(a.createdAt || a.joinDate || '')));
}

function localDateTime(iso?: string) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} · ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dayLabel(entry?: StaffDay) {
  if (!entry) return '';
  const time = entry.times[0];
  return time ? `${formatDate(entry.day)} ${time}` : formatDate(entry.day);
}

export function StaffScreen() {
  const t = useTheme();
  const { members, staff: rows, setStaff: setRows, attendance } = useGym();
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [staffRole, setStaffRole] = useState('trainer');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [viewing, setViewing] = useState<Member | null>(null);
  const [enrollId, setEnrollId] = useState('');
  const [photo, setPhoto] = useState('');
  const [liveImage, setLiveImage] = useState('');
  const [fingerImage, setFingerImage] = useState('');
  const [faceRegistered, setFaceRegistered] = useState(false);
  const [fingerRegistered, setFingerRegistered] = useState(false);
  const [fingerprint, setFingerprint] = useState('');
  const [pending, setPending] = useState<EnrollKind | null>(null);
  const [faceStatus, setFaceStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Member | null>(null);
  const [deleting, setDeleting] = useState(false);
  const claimed = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await fetchStaff());
    } catch (err) {
      setError(errorMessage(err, 'Could not load staff'));
    } finally {
      setLoading(false);
    }
  }, [setRows]);

  const month = todayISO().slice(0, 7);
  const statsById = useMemo(() => {
    const map = new Map<string, { days: StaffDay[]; monthDays: number; added: Member[] }>();
    for (const row of rows) {
      const days = staffDays(row, attendance);
      map.set(row.id, {
        days,
        monthDays: days.filter((d) => d.day.startsWith(`${month}-`)).length,
        added: addedByStaff(row, members),
      });
    }
    return map;
  }, [rows, attendance, members, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = rows.filter((row) => {
    const query = q.trim().toLowerCase();
    if (!query) return true;
    return `${row.name} ${row.phone || ''} ${row.email || ''}`.toLowerCase().includes(query);
  });

  const staffName = `${firstName} ${lastName}`.trim();

  function resetForm() {
    setEditing(null);
    setFirstName('');
    setLastName('');
    setPhone('');
    setEmail('');
    setNotes('');
    setStaffRole('trainer');
    setPassword('');
    setShowPassword(false);
    setEnrollId(nextEnrollId([...members, ...rows]));
    setPhoto('');
    setLiveImage('');
    setFingerImage('');
    setFaceRegistered(false);
    setFingerRegistered(false);
    setFingerprint('');
    setPending(null);
    setFaceStatus('');
    setFormError('');
    claimed.current = '';
  }

  function openAdd() {
    resetForm();
    setFormOpen(true);
    void resolveNextEnrollId([...members, ...rows]).then((id) => {
      if (!claimed.current) setEnrollId(id);
    });
  }

  function openEdit(row: Member) {
    const parts = splitName(row.name);
    setEditing(row);
    setFirstName(row.firstName || parts.firstName);
    setLastName(row.lastName || parts.lastName);
    setPhone(row.phone || '');
    setEmail(row.email || '');
    setNotes(row.notes || '');
    setStaffRole(row.staffRole || 'other');
    setPassword('');
    setShowPassword(false);
    setEnrollId(row.deviceEnrollId || nextEnrollId([...members, ...rows]));
    setPhoto(row.devicePhotoUrl || '');
    setLiveImage('');
    setFingerImage('');
    setFaceRegistered(Boolean(row.faceRegistered || row.devicePhotoUrl));
    setFingerRegistered(Boolean(row.deviceFingerprint && row.deviceFingerprint !== '0'));
    setFingerprint(row.deviceFingerprint || '');
    setFaceStatus(row.faceRegistered || row.devicePhotoUrl ? 'Face on file.' : '');
    setFormError('');
    claimed.current = row.deviceEnrollId || '';
    setFormOpen(true);
  }

  async function enroll(kind: EnrollKind) {
    if (pending) return;
    let id = enrollId.trim();
    if (!id) {
      id = await resolveNextEnrollId([...members, ...rows]);
      setEnrollId(id);
    }
    const name = staffName || `Staff ${id}`;
    setPending(kind);
    setFormError('');
    setFaceStatus(kind === 'finger' ? 'Place a finger on the terminal.' : 'Look at the terminal camera now.');
    try {
      const creds = await loadDeviceCreds();
      await loginDevice(creds.host, creds.username, creds.password);
      const replace = kind === 'face' ? faceRegistered : fingerRegistered;
      const started = await startDeviceEnroll(creds.host, id, name, kind, replace);
      if (!started.ok) {
        setFormError(started.message);
        return;
      }
      claimed.current = id;
      const captured = await waitDeviceEnroll(creds.host, id, kind, (p) => {
        setFaceStatus(p.status);
        if (p.image) {
          if (kind === 'finger') setFingerImage(p.image);
          else setLiveImage(p.image);
        }
      }, 90_000, name);
      if (!captured) {
        setFormError(`${kind === 'face' ? 'Face' : 'Fingerprint'} was not captured.`);
        return;
      }
      if (kind === 'face') {
        const next = (captured.preview && captured.preview.startsWith('data:image/'))
          ? captured.preview
          : (await fetchFacePreview(creds.host, id))
            || withPhotoCacheBust(captured.photourl || guessFacePhotoUrl(creds.host, id));
        setLiveImage(next);
        setPhoto(next);
        setFaceRegistered(true);
        setFaceStatus('Face saved. No end date — staff can scan anytime.');
      } else {
        setFingerprint('1');
        setFingerRegistered(true);
        setFaceStatus('Fingerprint saved.');
      }
    } catch (err) {
      setFormError(errorMessage(err, `Could not add ${kind}. Connect the face machine first.`, 'device'));
    } finally {
      setPending(null);
    }
  }

  async function onSave() {
    if (!firstName.trim()) {
      setFormError('First name is required');
      return;
    }
    if (password) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setFormError('Enter the staff email — it is their login ID.');
        return;
      }
      if (!PASSWORD_RULE.test(password)) {
        setFormError('Password must be at least 8 characters with a lowercase letter, a number, and a symbol.');
        return;
      }
    }
    setBusy(true);
    setFormError('');
    try {
      const saved = await saveStaff({
        id: editing?.cognitoId || editing?.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        notes: notes.trim(),
        ...(password ? { password } : {}),
        cognitoRole: 'staff',
        staffRole,
        deviceEnrollId: enrollId.trim(),
        devicePhotoUrl: photo,
        faceRegistered,
        deviceFingerprint: fingerprint,
        deviceVerifyMode: faceRegistered ? '8' : fingerRegistered ? '1' : '0',
        deviceEnd: STAFF_OPEN_END,
        renewDate: STAFF_OPEN_END,
        skipPayment: true,
      });
      setRows((prev) => {
        const without = prev.filter((row) => row.id !== saved.id && row.cognitoId !== saved.id);
        return [saved, ...without].sort((a, b) => String(a.name).localeCompare(String(b.name)));
      });
      feedbackAdded();
      setFormOpen(false);
      pushToast({
        kind: 'success',
        title: editing ? 'Staff updated' : 'Staff added',
        ...(password ? { message: `Login: ${saved.loginEmail || email.trim().toLowerCase()}` } : {}),
      });
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save staff'));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await removeMember(pendingDelete);
      setRows((prev) => prev.filter((row) => row.id !== pendingDelete.id && row.cognitoId !== pendingDelete.id));
      feedbackDeleted();
      setPendingDelete(null);
      pushToast({ kind: 'success', title: 'Staff removed' });
    } catch (err) {
      pushToast({ kind: 'error', title: errorMessage(err, 'Could not delete staff') });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenPad>
        <PageTitle>Staff</PageTitle>
        <Hint>Staff get face/finger on the terminal with no end date. They stay out of Members.</Hint>
        <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SearchBox style={{ flex: 1 }} value={q} onChange={setQ} placeholder="Name, phone, email" />
          <Pressable
            onPress={openAdd}
            style={{
              height: 40,
              borderRadius: 999,
              backgroundColor: t.accent,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="plus" color={t.accentInk} size={15} />
            <Text style={{ color: t.accentInk, fontSize: 13, fontWeight: '700' }}>Add staff</Text>
          </Pressable>
        </View>
        <ErrorText text={error} />
      </ScreenPad>
      {loading && !rows.length ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingTop: 10, paddingBottom: 24 }}
          ListEmptyComponent={!loading ? <Empty text="No staff yet. Tap Add staff." /> : null}
          renderItem={({ item }) => {
            const stats = statsById.get(item.id);
            const last = stats?.days[0];
            return (
            <Pressable
              onPress={() => setViewing(item)}
              style={{
                marginBottom: 10,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: t.line,
                backgroundColor: t.card,
                paddingHorizontal: 12,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: t.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: t.accent, fontSize: 13, fontWeight: '800' }}>{initials(item.name)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: t.text, fontSize: 14, fontWeight: '700' }}>{item.name}</Text>
                <Text numberOfLines={1} style={{ marginTop: 2, color: t.muted, fontSize: 12 }}>
                  {item.deviceEnrollId ? `ID ${item.deviceEnrollId}` : 'No device ID'}
                  {item.phone ? ` · ${item.phone}` : ''}
                </Text>
                <Text numberOfLines={1} style={{ marginTop: 2, color: t.muted, fontSize: 12 }}>
                  {`${stats?.monthDays || 0} day${stats?.monthDays === 1 ? '' : 's'} this month`}
                  {last ? ` · Last in ${dayLabel(last)}` : ''}
                </Text>
                <View style={{ marginTop: 6, flexDirection: 'row', gap: 4 }}>
                  <StatusBadge compact value="STAFF" />
                  {item.faceRegistered ? <StatusBadge compact value="FACE" /> : null}
                  {item.loginEmail ? <StatusBadge compact value="LOGIN" /> : null}
                </View>
              </View>
              <IconBtn name="pencil" color={t.muted} onPress={() => openEdit(item)} />
              <IconBtn
                name="trash"
                color={t.name === 'light' ? '#c81e1e' : '#ff6b6b'}
                onPress={() => setPendingDelete(item)}
              />
            </Pressable>
            );
          }}
        />
      )}

      {formOpen ? (
        <AppSheet
          title={editing ? 'Edit staff' : 'Add staff'}
          onClose={() => { if (!busy && !pending) setFormOpen(false); }}
          onSave={() => void onSave()}
          saveTitle={editing ? 'Save staff' : 'Add staff'}
          busy={busy || Boolean(pending)}
        >
          <FieldGrid>
            <FormField label="First name">
              <Field value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
            </FormField>
            <FormField label="Last name">
              <Field value={lastName} onChangeText={setLastName} autoCapitalize="words" />
            </FormField>
            <FormField label="Phone" wide>
              <Field value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            </FormField>
            <FormField label="Email" wide>
              <Field value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            </FormField>
            <FormField label="Role" wide>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {STAFF_ROLES.map((role) => {
                  const on = staffRole === role.value;
                  return (
                    <Pressable
                      key={role.value}
                      onPress={() => setStaffRole(role.value)}
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: on ? t.accent : t.line,
                        backgroundColor: on ? t.accentSoft : t.input,
                      }}
                    >
                      <Text style={{ color: on ? t.accent : t.text, fontSize: 13, fontWeight: '700' }}>{role.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </FormField>
            <FormField label={editing?.loginEmail ? 'New app password' : 'App password'} wide>
              <Field
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={editing?.loginEmail ? 'Leave blank to keep the current password' : 'Optional — creates their app login'}
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
                <Text style={{ color: t.accent, fontSize: 12, fontWeight: '700' }}>{showPassword ? 'Hide password' : 'Show password'}</Text>
              </Pressable>
            </FormField>
            <FormField label="Device ID" wide>
              <Field value={enrollId} onChangeText={setEnrollId} editable={!pending && !claimed.current} keyboardType="number-pad" />
            </FormField>
            <FormField label="Notes" wide>
              <Field value={notes} onChangeText={setNotes} multiline />
            </FormField>
          </FieldGrid>
          <Text style={{ marginTop: 10, color: t.muted, fontSize: 12 }}>
            No end date. Staff stay valid on the face machine.
            {editing?.loginEmail
              ? ` App login: ${editing.loginEmail}.`
              : ' With a password, they sign in to the app using this email.'}
          </Text>
          <FaceCapture
            photourl={photo}
            liveImage={liveImage}
            fingerImage={fingerImage}
            pending={pending}
            status={faceStatus}
            marks={{ face: faceRegistered, finger: fingerRegistered }}
            onEnroll={(kind) => void enroll(kind)}
          />
          <ErrorText text={formError} />
        </AppSheet>
      ) : null}

      {viewing ? (() => {
        const row = rows.find((r) => r.id === viewing.id) || viewing;
        const stats = statsById.get(row.id);
        const days = stats?.days || [];
        const added = stats?.added || [];
        const addedThisMonth = added.filter((m) => ymd(m.createdAt || m.joinDate).startsWith(`${month}-`)).length;
        return (
          <AppSheet
            title={row.name}
            onClose={() => setViewing(null)}
            onSave={() => { setViewing(null); openEdit(row); }}
            saveTitle="Edit staff"
          >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <StatTile label="Days this month" value={stats?.monthDays || 0} />
              <StatTile label="Members added" value={added.length} />
            </View>
            <View style={{ marginTop: 10 }}>
              <MetaRow label="App login" value={row.loginEmail || 'No login'} />
              <MetaRow label="Last app sign-in" value={localDateTime(row.lastLoginAt) || '—'} />
              <MetaRow label="Last in at gym" value={dayLabel(days[0]) || '—'} />
              <MetaRow label="Added this month" value={String(addedThisMonth)} />
            </View>

            <SectionTitle>Attendance</SectionTitle>
            {days.length ? days.slice(0, 31).map((entry) => (
              <MetaRow
                key={entry.day}
                label={formatDate(entry.day)}
                value={entry.times.length
                  ? entry.times.length > 1
                    ? `${entry.times[0]} – ${entry.times[entry.times.length - 1]}`
                    : entry.times[0]
                  : 'Present'}
              />
            )) : <Empty text="No scans on the face machine yet." />}

            <SectionTitle>Activity</SectionTitle>
            {added.length ? added.slice(0, 30).map((m) => (
              <MetaRow
                key={m.id}
                label={m.name}
                value={`Added ${formatDate(m.createdAt || m.joinDate)}`}
              />
            )) : <Empty text={row.loginEmail ? 'No members added yet.' : 'Give them an app password to track members they add.'} />}
          </AppSheet>
        );
      })() : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove staff"
        message={`Remove ${pendingDelete?.name} from staff?`}
        confirmLabel="Remove"
        danger
        busy={deleting}
        onClose={() => { if (!deleting) setPendingDelete(null); }}
        onConfirm={() => void onDelete()}
      />
    </View>
  );
}
