import { useEffect, useState } from "react";
import { signedPhotoUrl } from "@/lib/spaces";

export function SpacePhoto({
  path,
  alt,
  className,
}: {
  path: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    signedPhotoUrl(path)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [path]);
  if (!url) return <div className={`bg-muted animate-pulse ${className ?? ""}`} />;
  return <img src={url} alt={alt} className={className} loading="lazy" />;
}
