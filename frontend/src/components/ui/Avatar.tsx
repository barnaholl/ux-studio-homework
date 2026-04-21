import { memo, useState, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import profileSmall from '@/assets/icons/ProfileSmall.svg';
import profileBig from '@/assets/icons/ProfileBig.svg';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'lg';
  className?: string;
}

const Avatar = memo(function Avatar({
  src,
  name,
  size = 'sm',
  className,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  const resolvedSrc = useMemo(() => {
    if (!src) return null;
    if (src.startsWith('blob:') || src.startsWith('data:')) return src;
    // Static assets already have a file extension — skip S3 suffix logic
    if (/\.(png|jpe?g|webp|gif|svg)$/i.test(src)) return src;
    const suffix = size === 'sm' ? '-40.webp' : '-120.webp';
    return `${src}${suffix}`;
  }, [src, size]);

  useEffect(() => {
    setImgError(false);
  }, [resolvedSrc]);

  const showImage = resolvedSrc && !imgError;
  const placeholder = size === 'sm' ? profileSmall : profileBig;

  const sizeClasses = size === 'sm' ? 'h-10 w-10' : 'h-[88px] w-[88px]';

  const px = size === 'sm' ? 40 : 88;

  return (
    <div
      className={clsx(
        'relative shrink-0 rounded-full overflow-hidden flex items-center justify-center',
        sizeClasses,
        className,
      )}
    >
      <img
        src={showImage ? resolvedSrc : placeholder}
        alt={name}
        width={px}
        height={px}
        loading="lazy"
        className={clsx(
          'h-full w-full object-cover',
          !showImage && 'light:invert',
        )}
        onError={() => setImgError(true)}
      />
    </div>
  );
});

export default Avatar;
