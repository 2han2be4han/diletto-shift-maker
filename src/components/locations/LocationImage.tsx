'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { CHILD_LOCATION_IMAGES_BUCKET, COMMENT_IMAGES_BUCKET } from '@/types';

type Props = {
  storagePath: string;
  alt: string;
  bucket?: typeof CHILD_LOCATION_IMAGES_BUCKET | typeof COMMENT_IMAGES_BUCKET;
  className?: string;
};

/**
 * 非公開 Storage 画像を署名付き URL で取得して表示
 */
export default function LocationImage({
  storagePath,
  alt,
  bucket = CHILD_LOCATION_IMAGES_BUCKET,
  className,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/upload/signed-url?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(storagePath)}`
        );
        if (!res.ok) throw new Error();
        const { url } = await res.json();
        if (!cancelled) setUrl(url);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [storagePath, bucket]);

  if (error) {
    return (
      <div
        className={className ?? 'w-full h-32 flex items-center justify-center text-xs'}
        style={{ background: 'var(--bg)', color: 'var(--ink-3)', borderRadius: '8px' }}
      >
        画像を読み込めませんでした
      </div>
    );
  }
  if (!url) {
    return (
      <div
        className={className ?? 'w-full h-32'}
        style={{ background: 'var(--bg)', borderRadius: '8px' }}
      />
    );
  }

  return (
    <Image
      src={url}
      alt={alt}
      width={400}
      height={300}
      unoptimized
      className={className ?? 'w-full h-32 object-cover rounded-lg'}
    />
  );
}
