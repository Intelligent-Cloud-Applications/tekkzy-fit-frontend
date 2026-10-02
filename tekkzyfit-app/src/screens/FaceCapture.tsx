import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import type { EnrollKind } from '../device';
import { Icon } from '../icons';
import { useTheme } from '../theme';

export function FaceCapture({
  photourl,
  waiting,
  status,
  liveImage,
  fingerImage,
  pending,
  marks,
  onEnroll,
}: {
  photourl?: string;
  waiting?: boolean;
  status?: string;
  liveImage?: string;
  fingerImage?: string;
  pending?: EnrollKind | null;
  marks?: { face?: boolean; finger?: boolean; card?: boolean };
  onEnroll: (kind: EnrollKind) => void;
}) {
  const t = useTheme();
  const [fingerOpen, setFingerOpen] = useState(Boolean(marks?.finger || fingerImage || pending === 'finger'));
  const preview = liveImage && liveImage.length > 80 ? liveImage : '';
  const faceShown = preview || photourl || '';
  const faceBusy = pending === 'face' && !preview;
  const fingerBusy = pending === 'finger' && !fingerImage;
  const locked = Boolean(pending) || Boolean(waiting);
  const faceTaken = Boolean(marks?.face || preview || photourl);
  const fingerTaken = Boolean(marks?.finger || fingerImage);
  const faceBlocked = fingerTaken && !faceTaken;
  const fingerBlocked = faceTaken && !fingerTaken;

  return (
    <View style={{ gap: 12, marginTop: 8 }}>
      <CaptureTile
        title="Face"
        empty="No face yet"
        image={faceShown}
        waiting={faceBusy}
        waitLabel="Look at the terminal"
        done={Boolean(marks?.face && pending !== 'face')}
        status={pending === 'face' ? status : undefined}
        actionLabel={faceBusy ? 'Scanning…' : faceBlocked ? 'Fingerprint already added' : marks?.face || liveImage ? 'Retake face' : 'Add face'}
        actionDisabled={locked || faceBlocked}
        actionBusy={faceBusy}
        onAction={() => onEnroll('face')}
      />
      {fingerBlocked ? null : fingerOpen ? (
        <CaptureTile
          title="Fingerprint"
          empty={marks?.finger ? 'Fingerprint on the terminal' : 'No fingerprint yet'}
          image={fingerImage}
          waiting={fingerBusy}
          waitLabel="Use the fingerprint sensor"
          done={Boolean(marks?.finger && pending !== 'finger')}
          status={pending === 'finger' ? status : undefined}
          ghost
          actionLabel={fingerBusy ? 'Waiting…' : marks?.finger || fingerImage ? 'Retake finger' : 'Add finger'}
          actionDisabled={locked}
          actionBusy={fingerBusy}
          onAction={() => onEnroll('finger')}
        />
      ) : (
        <Pressable
          disabled={locked}
          onPress={() => setFingerOpen(true)}
          style={{
            minHeight: 40,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: t.line,
            backgroundColor: t.name === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: locked ? 0.4 : 1,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="finger" color={t.text} size={16} />
            <Text style={{ color: t.text, fontWeight: '600', fontSize: 13 }}>Add finger</Text>
            <Icon name="chevron" color={t.text} size={16} />
          </View>
        </Pressable>
      )}
      {status && !pending ? (
        <Text style={{ textAlign: 'center', color: t.muted, fontSize: 11, lineHeight: 16 }}>{status}</Text>
      ) : null}
    </View>
  );
}

function CaptureTile({
  title,
  empty,
  image,
  waiting,
  waitLabel,
  done,
  status,
  actionLabel,
  actionDisabled,
  actionBusy,
  ghost,
  onAction,
}: {
  title: string;
  empty: string;
  image?: string;
  waiting?: boolean;
  waitLabel: string;
  done?: boolean;
  status?: string;
  actionLabel: string;
  actionDisabled?: boolean;
  actionBusy?: boolean;
  ghost?: boolean;
  onAction: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.name === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)', padding: 12 }}>
      <Text style={{ marginBottom: 8, color: t.text, fontSize: 12, fontWeight: '600' }}>{title}</Text>
      <View
        style={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: 256,
          aspectRatio: 1,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: t.line,
          backgroundColor: t.bg,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {image ? (
          <Image key={image.slice(0, 80)} source={{ uri: image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <View style={{ paddingHorizontal: 12, alignItems: 'center' }}>
            <Icon name={title === 'Fingerprint' ? 'finger' : 'face'} color={t.accent} size={32} />
            <Text style={{ marginTop: 6, color: t.text, fontSize: 12, fontWeight: '700' }}>{waiting ? 'Scanning…' : empty}</Text>
          </View>
        )}
        {waiting ? (
          <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
        {waiting ? (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.accent, paddingVertical: 4 }}>
            <Text style={{ textAlign: 'center', color: t.accentInk, fontSize: 10, fontWeight: '700' }}>{waitLabel}</Text>
          </View>
        ) : done ? (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#18794e', paddingVertical: 4 }}>
            <Text style={{ textAlign: 'center', color: '#fff', fontSize: 10, fontWeight: '700' }}>Added</Text>
          </View>
        ) : null}
      </View>
      {status ? <Text style={{ marginTop: 8, textAlign: 'center', color: t.muted, fontSize: 11 }}>{status}</Text> : null}
      <Pressable
        disabled={actionDisabled || actionBusy}
        onPress={onAction}
        style={{
          marginTop: 12,
          minHeight: 40,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: ghost ? (t.name === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)') : t.accent,
          borderWidth: ghost ? 1 : 0,
          borderColor: t.line,
          opacity: actionDisabled ? 0.4 : 1,
        }}
      >
        {actionBusy ? <ActivityIndicator color={ghost ? t.accent : t.accentInk} /> : (
          <Text style={{ color: ghost ? t.text : t.accentInk, fontSize: 13, fontWeight: '600' }}>{actionLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}
