"use client";

import { useEffect, useMemo, useState } from "react";

const PLACEHOLDER_SRC = "/product-placeholder.svg";

type ProductImageProps = {
  src: string;
  alt: string;
  className?: string;
};

export function ProductImage({ src, alt, className }: ProductImageProps) {
  const normalizedSrc = useMemo(() => src.trim(), [src]);
  const [displaySrc, setDisplaySrc] = useState(
    normalizedSrc || PLACEHOLDER_SRC,
  );

  useEffect(() => {
    setDisplaySrc(normalizedSrc || PLACEHOLDER_SRC);
  }, [normalizedSrc]);

  return (
    <img
      src={displaySrc}
      alt={alt}
      loading="lazy"
      onError={() => {
        if (displaySrc !== PLACEHOLDER_SRC) {
          setDisplaySrc(PLACEHOLDER_SRC);
        }
      }}
      className={className}
    />
  );
}
