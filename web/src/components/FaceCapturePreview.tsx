import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Fingerprint, ScanFace } from 'lucide-react';
import { Button } from '@/components/Button';
import { fetchLivePhotoObjectUrl, guessFacePhotoPath } from '@/services/liveDevice';

export type EnrollKind = 'face' | 'finger' | 'card';

export function FaceCapturePreview({
  enrollid,
  photourl,
  waiting,
  status,
  liveImage,
  fingerImage,
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
  fingerImage?: string;
  pending?: EnrollKind | null;
  marks?: { face?: boolean; finger?: boolean; card?: boolean };
  onEnroll?: (kind: EnrollKind) => void;
  className?: string;
}) {
  const [faceSrc, setFaceSrc] = useState('');
  const [fingerOpen, setFingerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const path = photourl || (enrollid ? guessFacePhotoPath(enrollid) : '');
    if (!path) {
      setFaceSrc('');
      return undefined;
    }
    if (path.startsWith('data:image/') && path.length > 80) {
      setFaceSrc(path);
      return undefined;
    }
    void fetchLivePhotoObjectUrl(path).then((next) => {
      if (!active) {
        if (next?.startsWith('blob:')) URL.revokeObjectURL(next);
        return;
      }
      setFaceSrc((prev) => {
        if (prev.startsWith('blob:') && prev !== next) URL.revokeObjectURL(prev);
        return next || '';
      });
    });
    return () => {
      active = false;
    };
  }, [enrollid, photourl]);

  useEffect(() => {
    setFingerOpen(Boolean(marks?.finger || fingerImage || pending === 'finger'));
  }, [enrollid, marks?.finger, fingerImage, pending]);

  const preview = liveImage && liveImage.length > 80 ? liveImage : '';
  const faceShown = preview || faceSrc;
  const fingerShown = fingerImage;
  const faceBusy = pending === 'face' && !preview;
  const fingerBusy = pending === 'finger' && !fingerImage;
  const locked = Boolean(pending) || Boolean(waiting);
  const faceTaken = Boolean(marks?.face || preview || faceSrc);
  const fingerTaken = Boolean(marks?.finger || fingerImage);
  const faceBlocked = fingerTaken && !faceTaken;
  const fingerBlocked = faceTaken && !fingerTaken;

  return (
    <div className={`space-y-3 ${className}`}>
      <CaptureTile
        title="Face"
        icon={ScanFace}
        image={faceShown}
        empty="No face yet"
        waiting={faceBusy}
        waitLabel="Look at the terminal"
        done={Boolean(marks?.face && pending !== 'face')}
        status={pending === 'face' ? status : undefined}
        action={
          onEnroll ? (
            <Button
              type="button"
              className="w-full"
              loading={faceBusy}
              disabled={locked || faceBlocked}
              onClick={() => onEnroll('face')}
            >
              {faceBusy ? 'Scanning…' : faceBlocked ? 'Fingerprint already added' : marks?.face || liveImage ? 'Retake face' : 'Add face'}
            </Button>
          ) : null
        }
      />
      {fingerBlocked ? null : fingerOpen ? (
        <CaptureTile
          title="Fingerprint"
          icon={Fingerprint}
          image={fingerShown}
          empty={marks?.finger ? 'Fingerprint on the terminal' : 'No fingerprint yet'}
          waiting={fingerBusy}
          waitLabel="Use the fingerprint sensor"
          done={Boolean(marks?.finger && pending !== 'finger')}
          status={pending === 'finger' ? status : undefined}
          action={
            onEnroll ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                loading={fingerBusy}
                disabled={locked}
                onClick={() => onEnroll('finger')}
              >
                {fingerBusy ? 'Waiting…' : marks?.finger || fingerImage ? 'Retake finger' : 'Add finger'}
              </Button>
            ) : null
          }
        />
      ) : onEnroll ? (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={locked}
          onClick={() => setFingerOpen(true)}
        >
          <Fingerprint className="h-4 w-4" />
          Add finger
          <ChevronDown className="h-4 w-4" />
        </Button>
      ) : null}
      {status && !pending ? (
        <p className="text-center text-[11px] leading-snug text-ink-soft">{status}</p>
      ) : null}
    </div>
  );
}

function CaptureTile({
  title,
  icon: Icon,
  image,
  empty,
  waiting,
  waitLabel,
  done,
  status,
  action,
}: {
  title: string;
  icon: typeof ScanFace;
  image?: string;
  empty: string;
  waiting?: boolean;
  waitLabel: string;
  done?: boolean;
  status?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-[var(--hover-fill)] p-3 sm:p-3.5">
      <div className="mb-2 text-[12px] font-semibold text-ink">{title}</div>
      <div className="relative mx-auto grid aspect-square w-full max-w-[16rem] place-items-center overflow-hidden rounded-xl border border-line bg-[var(--panel)]">
        {image ? (
          <img
            src={image}
            alt={title}
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="px-3 text-center text-ink-soft">
            <Icon className="mx-auto mb-1.5 h-8 w-8 text-accent" />
            <div className="text-[12px] font-semibold text-ink">{waiting ? 'Scanning…' : empty}</div>
          </div>
        )}
        {waiting ? (
          <div className="absolute inset-0 grid place-items-center bg-black/45">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        ) : null}
        {waiting ? (
          <div className="absolute inset-x-0 bottom-0 bg-accent px-2 py-1 text-center text-[10px] font-semibold text-white">
            {waitLabel}
          </div>
        ) : done ? (
          <div className="absolute inset-x-0 bottom-0 bg-ok px-2 py-1 text-center text-[10px] font-semibold text-white">
            Added
          </div>
        ) : null}
      </div>
      {status ? <p className="mt-2 text-center text-[11px] leading-snug text-ink-soft">{status}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
