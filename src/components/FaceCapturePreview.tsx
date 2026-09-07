import { useEffect, useState } from 'react';
import { ScanFace } from 'lucide-react';
import { Button } from '@/components/Button';
import { fetchLivePhotoObjectUrl, guessFacePhotoPath } from '@/services/liveDevice';

export type EnrollKind = 'face' | 'finger' | 'card';

const KIND_LABEL: Record<EnrollKind, { idle: string; wait: string; done: string }> = {
  face: { idle: 'Add face', wait: 'Scanning…', done: 'Face added' },
  finger: { idle: 'Finger', wait: 'Waiting…', done: 'Added' },
  card: { idle: 'Card', wait: 'Waiting…', done: 'Added' },
};

export function FaceCapturePreview({
  enrollid,
  photourl,
  waiting,
  status,
  liveImage,
  pending,
  marks,
  onEnroll,
  className = '',
}: {
  enrollid: string;
  photourl?: string;
  waiting?: boolean;
  status?: string;
  liveImage?: string;
  pending?: EnrollKind | null;
  marks?: { face?: boolean; finger?: boolean; card?: boolean };
  onEnroll?: (kind: EnrollKind) => void;
  className?: string;
}) {
  const [src, setSrc] = useState('');
  const busy = Boolean(pending) || Boolean(waiting);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    const path = photourl || (enrollid ? guessFacePhotoPath(enrollid) : '');
    if (!path || waiting || pending) {
      if (!path) setSrc('');
      return undefined;
    }
    void fetchLivePhotoObjectUrl(path).then((next) => {
      if (!active) {
        if (next) URL.revokeObjectURL(next);
        return;
      }
      objectUrl = next || '';
      setSrc(objectUrl);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [enrollid, photourl, waiting, pending]);

  function label(kind: EnrollKind) {
    if (pending === kind) return KIND_LABEL[kind].wait;
    if (marks?.[kind]) return KIND_LABEL[kind].done;
    return KIND_LABEL[kind].idle;
  }

  return (
    <div className={`rounded-2xl border border-line bg-[var(--hover-fill)] p-3 sm:p-3.5 ${className}`}>
      <div className="relative mx-auto grid aspect-square w-full max-w-[16rem] place-items-center overflow-hidden rounded-xl border border-line bg-[var(--panel)]">
        {liveImage || src ? (
          <img src={liveImage || src} alt="Captured face" className="h-full w-full object-cover" />
        ) : (
          <div className="px-3 text-center text-ink-soft">
            <ScanFace className="mx-auto mb-1.5 h-8 w-8 text-accent" />
            <div className="text-[12px] font-semibold text-ink">
              {busy ? 'Scanning…' : 'No face yet'}
            </div>
          </div>
        )}
        {busy ? (
          <div className="absolute inset-0 grid place-items-center bg-black/45">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        ) : null}
        {busy ? (
          <div className="absolute inset-x-0 bottom-0 bg-accent px-2 py-1 text-center text-[10px] font-semibold text-white">
            {pending === 'finger' ? 'Use the fingerprint sensor' : pending === 'card' ? 'Tap the card on the reader' : 'Look at the terminal'}
          </div>
        ) : null}
      </div>
      {status ? <p className="mt-2 text-center text-[11px] leading-snug text-ink-soft">{status}</p> : null}
      {onEnroll ? (
        <div className="mt-3 space-y-2">
          <Button type="button" className="w-full" loading={pending === 'face'} disabled={busy} onClick={() => onEnroll('face')}>
            {label('face')}
          </Button>
          <div className="grid grid-cols-2 gap-1.5">
            <Button type="button" variant="secondary" className="w-full px-2 text-[12px]" loading={pending === 'finger'} disabled={busy} onClick={() => onEnroll('finger')}>
              {label('finger')}
            </Button>
            <Button type="button" variant="secondary" className="w-full px-2 text-[12px]" loading={pending === 'card'} disabled={busy} onClick={() => onEnroll('card')}>
              {label('card')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
