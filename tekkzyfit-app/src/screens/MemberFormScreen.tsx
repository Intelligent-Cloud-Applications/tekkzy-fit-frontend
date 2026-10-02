import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { nextEnrollId, planEndDate, resolveNextEnrollId, saveMember, saveMemberPhoto } from '../api';
import { errorMessage } from '../errors';
import {
  fetchFacePreview,
  guessFacePhotoUrl,
  loadExistingFaceFromDevice,
  loginDevice,
  startDeviceEnroll,
  waitDeviceEnroll,
  withPhotoCacheBust,
  type EnrollKind,
} from '../device';
import { addDays, formatINR, splitName, todayISO } from '../format';
import { useGym } from '../GymContext';
import type { RootStackParamList } from '../nav';
import { loadDeviceCreds, loadSession } from '../session';
import { AppSheet, FormHint } from '../sheet';
import { useTheme } from '../theme';
import { DateField, ErrorText, Field, FieldGrid, FormField, Select } from '../ui';
import { feedbackAdded } from '../feedback';
import { pushToast } from '../toast';
import { FaceCapture } from './FaceCapture';

function dateInput(value?: string | null) {
  const day = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}

export function MemberFormScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'MemberForm'>) {
  const t = useTheme();
  const { members, plans, setMembers, refreshMember } = useGym();
  const existing = members.find((m) => m.id === route.params.memberId || m.cognitoId === route.params.memberId);
  const isEdit = Boolean(existing);
  const parts = splitName(existing?.name || route.params.name);
  const onlineLocked = Boolean(existing?.renewDateSource === 'razorpay' || existing?.subscriptionId);
  const [firstName, setFirstName] = useState(existing?.firstName || parts.firstName);
  const [lastName, setLastName] = useState(existing?.lastName || parts.lastName);
  const [phone, setPhone] = useState(existing?.phone || '');
  const [email, setEmail] = useState(existing?.email || '');
  const [gender, setGender] = useState(existing?.gender || 'Male');
  const [birthday, setBirthday] = useState(existing?.dateOfBirth && existing.dateOfBirth !== '1995-01-15' ? existing.dateOfBirth : '');
  const [planId, setPlanId] = useState(route.params.planId || existing?.planId || existing?.membership?.planId || plans[0]?.id || '');
  const [startDate, setStartDate] = useState(existing?.joinDate || todayISO());
  const [endDate, setEndDate] = useState(dateInput(existing?.renewDate || existing?.deviceEnd || existing?.membership?.expiryDate));
  const [method, setMethod] = useState<'CASH' | 'UPI' | 'ONLINE'>(isEdit && !onlineLocked ? 'CASH' : 'ONLINE');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [enrollId, setEnrollId] = useState(existing?.deviceEnrollId || route.params.enrollId || nextEnrollId(members));
  const enrollTouched = useRef(Boolean(existing?.deviceEnrollId || route.params.enrollId));
  const [shift, setShift] = useState(existing?.deviceShift || '1');
  const [card, setCard] = useState(existing?.deviceCard || '0');
  const [verifyMode, setVerifyMode] = useState(existing?.deviceVerifyMode || '0');
  const [photo, setPhoto] = useState(existing?.devicePhotoUrl || '');
  const [faceRegistered, setFaceRegistered] = useState(Boolean(existing?.faceRegistered || existing?.devicePhotoUrl));
  const [fingerRegistered, setFingerRegistered] = useState(Boolean(existing?.deviceFingerprint && existing.deviceFingerprint !== '0'));
  const [cardRegistered, setCardRegistered] = useState(Boolean(existing?.deviceCard && existing.deviceCard !== '0'));
  const [fingerprint, setFingerprint] = useState(existing?.deviceFingerprint || '');
  const [more, setMore] = useState(false);
  const [pending, setPending] = useState<EnrollKind | null>(null);
  const [faceStatus, setFaceStatus] = useState(
    existing?.faceRegistered || existing?.devicePhotoUrl ? 'Face on file from the terminal.' : '',
  );
  const [liveImage, setLiveImage] = useState('');
  const [fingerImage, setFingerImage] = useState('');
  const [claimedEnroll, setClaimedEnroll] = useState(existing?.deviceEnrollId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');

  const plan = plans.find((p) => p.id === planId);
  const desk = method === 'CASH' || method === 'UPI';
  const canEditEnd = isEdit || desk;
  const shownEnd = endDate || planEndDate(startDate, plan);
  const planChoices = useMemo(() => plans.filter((p) => p.status !== 'INACTIVE'), [plans]);
  const memberName = `${firstName} ${lastName}`.trim() || (existing?.name || '').trim();

  useEffect(() => {
    if (isEdit || existing?.deviceEnrollId || route.params.enrollId) return;
    let cancelled = false;
    void resolveNextEnrollId(members).then((id) => {
      if (cancelled || enrollTouched.current) return;
      setEnrollId(id);
    });
    return () => {
      cancelled = true;
    };
    // Resolve once when Add member opens so the field shows the next machine ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.deviceEnrollId, isEdit, route.params.enrollId]);

  useEffect(() => {
    const id = String(enrollId || '').trim();
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const creds = await loadDeviceCreds();
        if (!creds.host || cancelled) return;
        await loginDevice(creds.host, creds.username, creds.password).catch(() => undefined);
        if (cancelled) return;
        const loaded = await loadExistingFaceFromDevice(creds.host, id, photo || existing?.devicePhotoUrl);
        if (cancelled) return;
        if (loaded.preview) {
          setLiveImage(loaded.preview);
          setFaceStatus('Face on file from the terminal.');
        }
        if (loaded.photourl) setPhoto(loaded.photourl);
        if (existing && loaded.photourl.startsWith('data:image/') && !/X-Amz-Signature=/i.test(existing.devicePhotoUrl || '')) {
          void saveMemberPhoto(existing, loaded.photourl).catch(() => undefined);
        }
        if (loaded.faceRegistered) setFaceRegistered(true);
        else if (!loaded.preview && (existing?.faceRegistered || existing?.devicePhotoUrl)) {
          setFaceStatus('Face is on the terminal, but this phone could not load the photo. Stay on gym Wi‑Fi.');
        }
      } catch {
        /* machine offline — keep cloud photo if any */
      }
    })();
    return () => {
      cancelled = true;
    };
    // Hydrate once per enroll id when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollId]);

  function setEnrollIdTouched(value: string) {
    enrollTouched.current = true;
    setEnrollId(value);
  }

  async function enroll(kind: EnrollKind) {
    if (pending) return;
    let id = enrollId.trim();
    if (!id) {
      id = await resolveNextEnrollId(members);
      setEnrollId(id);
    }
    const taken = members.find((m) => String(m.deviceEnrollId || '').trim() === id && m.id !== existing?.id);
    if (taken && !isEdit && claimedEnroll !== id) {
      const next = await resolveNextEnrollId(members);
      setEnrollId(next);
      setError(`Device ID ${id} is already used by ${taken.name}. Use ${next} for a new member, or edit ${taken.name} to add their face.`);
      return;
    }
    if (kind === 'finger' && faceRegistered) {
      setError('This member already has a face. The terminal keeps one biometric.');
      return;
    }
    if (kind === 'face' && fingerRegistered) {
      setError('This member already has a fingerprint. The terminal keeps one biometric.');
      return;
    }
    const name = memberName || `Member ${id}`;
    setPending(kind);
    setError('');
    if (kind === 'face') setLiveImage('');
    setFaceStatus(kind === 'finger' ? 'Place a finger on the terminal sensor.' : kind === 'card' ? 'Tap the card on the terminal.' : 'Look at the terminal camera now.');
    try {
      const creds = await loadDeviceCreds();
      await loginDevice(creds.host, creds.username, creds.password);
      // On edit/retake always replace — faceRegistered can be wrong if the photo failed to load.
      const replace = isEdit
        || (kind === 'face' ? faceRegistered : kind === 'finger' ? fingerRegistered : false);
      const started = await startDeviceEnroll(creds.host, id, name, kind, replace);
      if (!started.ok) {
        setError(started.message);
        return;
      }
      setClaimedEnroll(id);
      const captured = await waitDeviceEnroll(creds.host, id, kind, (p) => {
        setFaceStatus(p.status);
        if (p.image) {
          if (kind === 'finger') setFingerImage(p.image);
          else if (kind === 'face') setLiveImage(p.image);
        }
      }, 90_000, name);
      if (!captured) {
        setFaceStatus(`No ${kind} yet. Try again on the terminal.`);
        setError(`${kind === 'face' ? 'Face' : kind === 'finger' ? 'Fingerprint' : 'Card'} was not captured.`);
        return;
      }
      if (kind === 'face') {
        // Prefer the freshly captured image. Pulling LF*.jpg first often kept the OLD face.
        const next = (captured.preview && captured.preview.startsWith('data:image/'))
          ? captured.preview
          : (await fetchFacePreview(creds.host, id))
            || withPhotoCacheBust(captured.photourl || guessFacePhotoUrl(creds.host, id));
        setLiveImage(next);
        setPhoto(next);
        setFaceRegistered(true);
        setFaceStatus('Face updated on the terminal.');
      } else if (kind === 'finger') {
        setFingerprint('1');
        setFingerRegistered(true);
        setFaceStatus('Fingerprint added on the terminal.');
      } else {
        setCard(card && card !== '0' ? card : '1');
        setCardRegistered(true);
        setFaceStatus('Card added on the terminal.');
      }
    } catch (err) {
      setError(errorMessage(err, `Could not add ${kind}. Connect the face machine in Settings → Terminal first.`, 'device'));
    } finally {
      setPending(null);
    }
  }

  function invalid(message: string, field?: 'email') {
    setError(message);
    setEmailError(field === 'email' ? message : '');
    pushToast({ kind: 'warning', title: isEdit ? 'Cannot save member' : 'Cannot add member', message });
  }

  async function onSave() {
    if (!firstName.trim() && !memberName) {
      invalid('Enter a first name.');
      return;
    }
    if (!phone.trim()) {
      invalid('Enter a phone number.');
      return;
    }
    const mail = email.trim();
    const mailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail);
    if (method === 'ONLINE' && !isEdit && !mail) {
      invalid('Email is required for Online payment — the subscription link is sent to it. Enter an email, or choose Cash / UPI.', 'email');
      return;
    }
    if (mail && !mailOk) {
      invalid(`"${mail}" is not a valid email. Example: name@gmail.com`, 'email');
      return;
    }
    setEmailError('');
    setBusy(true);
    setError('');
    try {
      const session = isEdit ? null : await loadSession();
      const originalEnd = dateInput(existing?.renewDate || existing?.deviceEnd || existing?.membership?.expiryDate);
      const nextEnd = canEditEnd ? shownEnd : existing?.deviceEnd;
      const extending = Boolean(isEdit && nextEnd && originalEnd && nextEnd > originalEnd);
      const saved = await saveMember({
        id: existing?.cognitoId || existing?.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        gender,
        dateOfBirth: birthday,
        joinDate: startDate,
        startDate,
        status: existing?.status || 'ACTIVE',
        notes,
        planId,
        planName: plan?.name,
        amount: plan?.price,
        durationDays: plan?.durationDays,
        paymentMethod: isEdit ? undefined : method,
        sendPayLink: !isEdit && method === 'ONLINE',
        skipPayment: !isEdit && desk,
        renewDate: canEditEnd ? nextEnd : existing?.renewDate,
        deviceEnd: nextEnd,
        deviceEnrollId: enrollId.trim(),
        memberCode: existing?.memberCode || `MEM-${enrollId || Date.now().toString().slice(-6)}`,
        renewDateSource: extending && onlineLocked ? 'extended' : (!onlineLocked && (desk || isEdit) ? 'manual' : existing?.renewDateSource || undefined),
        extendDueDate: extending && onlineLocked,
        faceRegistered,
        devicePhotoUrl: photo,
        deviceCard: card,
        deviceFingerprint: fingerprint,
        deviceVerifyMode: verifyMode,
        deviceShift: shift,
        ...(!isEdit && session?.user
          ? { addedById: session.user.id, addedByName: session.user.name }
          : {}),
      });
      if (existing) setMembers(members.map((m) => (m.id === existing.id ? { ...m, ...saved } : m)));
      else setMembers((prev) => [saved, ...prev.filter((m) => m.id !== saved.id)]);
      void refreshMember(saved.cognitoId || saved.id, saved).catch(() => undefined);
      if (!isEdit) feedbackAdded();
      if (saved.deviceQueued) {
        pushToast({
          kind: 'warning',
          title: 'Saved in the cloud',
          message: saved.deviceError
            ? `The terminal is connected but refused the update: ${saved.deviceError}. It will retry on the next sync.`
            : 'The face machine was not connected. This member will sync the next time this phone connects.',
        });
      } else {
        pushToast({
          kind: 'success',
          title: extending && saved.paymentLinkUrl
            ? 'Due date updated. Pay link sent to the member'
            : !isEdit && (method === 'CASH' || method === 'UPI')
              ? 'Member added on the website and the terminal'
              : !isEdit && saved.paymentLinkUrl
                ? 'Member added. Payment pending'
                : 'Member saved',
          message: saved.paymentLinkUrl
            ? 'The pay link was sent. After they pay, they are marked paid.'
            : !isEdit && (method === 'CASH' || method === 'UPI')
              ? `On the terminal and marked paid by ${method === 'UPI' ? 'UPI' : 'cash'} at the desk.`
              : 'On the website and the terminal.',
        });
      }
      navigation.goBack();
    } catch (err) {
      const message = errorMessage(err, 'Save failed');
      setError(message);
      if (/email/i.test(message)) setEmailError(message);
      pushToast({ kind: 'error', title: isEdit ? 'Could not save member' : 'Could not add member', message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet
      title={isEdit ? 'Edit member' : 'Add member'}
      onClose={() => navigation.goBack()}
      onSave={() => void onSave()}
      busy={busy || Boolean(pending)}
      saveTitle={busy ? 'Saving…' : isEdit ? 'Save' : 'Add member'}
    >
      <View style={{ gap: 20 }}>
      <View style={{ gap: 12 }}>
      <FieldGrid>
        <FormField label="First name">
          <Field value={firstName} onChangeText={setFirstName} placeholder="First name" />
        </FormField>
        <FormField label="Last name">
          <Field value={lastName} onChangeText={setLastName} placeholder="Last name" />
        </FormField>
        <FormField wide label="Phone">
          <Field value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Phone number" />
        </FormField>
        <FormField wide label={!isEdit && method === 'ONLINE' ? 'Email (required for Online payment)' : 'Email (optional)'}>
          <Field
            value={email}
            onChangeText={(next) => {
              setEmail(next);
              if (emailError) setEmailError('');
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder={!isEdit && method === 'ONLINE' ? 'name@gmail.com — pay link is sent here' : 'Email'}
            style={emailError ? { borderColor: '#FF3B30', borderWidth: 1.5 } : undefined}
          />
          {emailError ? <Text style={{ color: '#FF3B30', fontSize: 12, marginTop: 4 }}>{emailError}</Text> : null}
        </FormField>

        {!isEdit ? (
          <>
            <FormField label="Plan">
              <Select
                title="Plan"
                value={planId}
                onChange={(next) => {
                  setPlanId(next);
                  const found = plans.find((p) => p.id === next);
                  if (desk) setEndDate(addDays(startDate, found?.durationDays || 30));
                }}
                options={planChoices.map((p) => ({
                  value: p.id,
                  label: `${p.name}${p.price != null ? ` · ${formatINR(p.price)}` : ''}${Number(p.addonAmount || 0) > 0 ? ` + ${formatINR(Number(p.addonAmount))} admission` : ''}`,
                }))}
              />
            </FormField>
            <FormField label="Payment">
              <Select
                title="Payment"
                value={method}
                onChange={(next) => {
                  const key = next as 'CASH' | 'UPI' | 'ONLINE';
                  setMethod(key);
                  if (key === 'CASH' || key === 'UPI') setEndDate((prev) => prev || planEndDate(startDate, plan));
                }}
                options={[
                  { value: 'CASH', label: 'Cash' },
                  { value: 'UPI', label: 'UPI' },
                  { value: 'ONLINE', label: 'Online' },
                ]}
              />
            </FormField>
            <FormField label="Start date">
              <DateField
                value={startDate}
                onChange={(value) => {
                  setStartDate(value);
                  if (desk) setEndDate(planEndDate(value, plan));
                }}
              />
            </FormField>
            <FormField label="End date (dd/mm/yyyy)">
              <DateField value={shownEnd} onChange={setEndDate} editable={canEditEnd} />
            </FormField>
            <View style={{ flexBasis: '100%', minWidth: '100%' }}>
              <FormHint>
                {canEditEnd
                  ? `${method === 'UPI' ? 'UPI' : 'Cash'} at the desk — you can set the end date. It is pushed to the terminal when you save.`
                  : 'Online subscriptions follow the plan. After they pay, you can extend the due date from Edit member.'}
              </FormHint>
            </View>
            <FormField wide label="Device ID">
              <Field value={enrollId} onChangeText={setEnrollIdTouched} editable={!pending && !claimedEnroll} />
            </FormField>
          </>
        ) : (
          <>
            <FormField label="Gender">
              <Select
                title="Gender"
                value={gender}
                onChange={setGender}
                options={[
                  { value: 'Male', label: 'Male' },
                  { value: 'Female', label: 'Female' },
                  { value: 'Other', label: 'Other' },
                ]}
              />
            </FormField>
            <FormField label="Device ID">
              <Field value={enrollId} onChangeText={setEnrollIdTouched} editable={!pending && !claimedEnroll} />
            </FormField>
            <FormField label="Due date (dd/mm/yyyy)">
              <DateField value={shownEnd || endDate} onChange={setEndDate} editable={canEditEnd} />
            </FormField>
            <View style={{ flexBasis: '100%', minWidth: '100%' }}>
              <FormHint>
                If they missed days, move the due date forward. Razorpay will charge from that date, and the terminal end date updates when you save.
              </FormHint>
            </View>
          </>
        )}
      </FieldGrid>

      <View style={{ borderRadius: 12, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
        <Pressable onPress={() => setMore((v) => !v)} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: t.text, fontSize: 12, fontWeight: '600' }}>{more ? 'More details' : 'More details'}</Text>
        </Pressable>
        {more ? (
          <View style={{ borderTopWidth: 1, borderTopColor: t.line, padding: 12 }}>
            <FieldGrid>
              <FormField label="Birthday">
                <DateField value={birthday} onChange={setBirthday} />
              </FormField>
              <FormField label="Gender">
                <Select
                  title="Gender"
                  value={gender}
                  onChange={setGender}
                  options={[
                    { value: 'Male', label: 'Male' },
                    { value: 'Female', label: 'Female' },
                    { value: 'Other', label: 'Other' },
                  ]}
                />
              </FormField>
              <FormField label="Shift">
                <Field value={shift} onChangeText={setShift} />
              </FormField>
              <FormField label="Card">
                <Field value={card} onChangeText={setCard} />
              </FormField>
              <FormField label="Verify mode">
                <Select
                  title="Verify mode"
                  value={verifyMode}
                  onChange={setVerifyMode}
                  options={[
                    { value: '0', label: 'Device' },
                    { value: '8', label: 'Face' },
                    { value: '1', label: 'Fingerprint' },
                    { value: '2', label: 'Card' },
                    { value: '3', label: 'Password' },
                  ]}
                />
              </FormField>
              <FormField wide label="Notes">
                <Field value={notes} onChangeText={setNotes} />
              </FormField>
            </FieldGrid>
          </View>
        ) : null}
      </View>
      </View>

      <View>
        <FaceCapture
          photourl={liveImage || withPhotoCacheBust(photo, existing?.updatedAt)}
          waiting={Boolean(pending)}
          status={faceStatus || (memberName ? memberName : 'Enter a name first')}
          liveImage={liveImage}
          fingerImage={fingerImage}
          pending={pending}
          marks={{ face: faceRegistered, finger: fingerRegistered, card: cardRegistered }}
          onEnroll={(kind) => void enroll(kind)}
        />
      </View>

      <ErrorText text={error} />
      </View>
    </AppSheet>
  );
}
