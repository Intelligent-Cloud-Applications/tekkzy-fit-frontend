import { useEffect, useState } from 'react';
import { initials } from '@/lib/format';
import { cn } from '@/lib/cn';
import { fetchLivePhotoObjectUrl, guessFacePhotoPath } from '@/services/liveDevice';

const palette = ['#3a0d0d', '#2a1214', '#1a0a0a', '#4a1010', '#2a0808', '#161012'];

function photoPath(photoUrl?: string, enrollId?: string) {
  const raw = String(photoUrl || '').trim();
  if (raw.startsWith('data:image/') || raw.startsWith('blob:')) return raw;
  if (raw.startsWith('/photos/') || raw.startsWith('/photo/')) return raw;
  if (enrollId) return guessFacePhotoPath(enrollId, raw || undefined);
  return '';
}

export function MemberAvatar({
  name,
  size = 32,
  photoUrl,
  enrollId,
}: {
  name: string;
  size?: number;
  photoUrl?: string;
  enrollId?: string;
}) {
  const [src, setSrc] = useState('');
  const seed = name.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const path = photoPath(photoUrl, enrollId);

  useEffect(() => {
    let active = true;
    if (!path) {
      setSrc('');
      return undefined;
    }
    if (path.startsWith('data:image/') || path.startsWith('blob:')) {
      setSrc(path);
      return undefined;
    }
    void fetchLivePhotoObjectUrl(path).then((next) => {
      if (!active) {
        if (next?.startsWith('blob:')) URL.revokeObjectURL(next);
        return;
      }
      setSrc((prev) => {
        if (prev.startsWith('blob:') && prev !== next) URL.revokeObjectURL(prev);
        return next || '';
      });
    });
    return () => {
      active = false;
    };
  }, [path]);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        onError={() => setSrc('')}
      />
    );
  }

  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold text-accent')}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        background: palette[seed % palette.length],
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
