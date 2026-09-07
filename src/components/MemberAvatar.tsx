import { useEffect, useState } from 'react';
import { initials } from '@/lib/format';
import { cn } from '@/lib/cn';
import { fetchLivePhotoObjectUrl } from '@/services/liveDevice';

const palette = ['#3a0d0d', '#2a1214', '#1a0a0a', '#4a1010', '#2a0808', '#161012'];

export function MemberAvatar({
  name,
  size = 32,
  photoUrl,
}: {
  name: string;
  size?: number;
  photoUrl?: string;
}) {
  const [src, setSrc] = useState('');
  const seed = name.split('').reduce((s, c) => s + c.charCodeAt(0), 0);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    if (!photoUrl || photoUrl.startsWith('/') || photoUrl.startsWith('http://')) {
      setSrc('');
      return undefined;
    }
    void fetchLivePhotoObjectUrl(photoUrl).then((next) => {
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
  }, [photoUrl]);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
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
