import { useState } from "react";
import { cn } from "../lib/utils";

/**
 * Brand wordmark. Renders text by default; pass `src` only when the operator
 * supplies an approved logo asset. Never renders both.
 */
export function BrandLogo({
  name,
  textClassName,
  className,
  imgClassName,
  src,
}: {
  name: string;
  textClassName?: string;
  className?: string;
  imgClassName?: string;
  src?: string;
}) {
  const [missing, setMissing] = useState(false);
  if (!src || missing) {
    return <span className={cn("font-bold tracking-tight", textClassName)}>{name}</span>;
  }
  return (
    <img
      src={src}
      alt={name}
      onError={() => setMissing(true)}
      className={cn("h-6 w-auto", imgClassName, className)}
    />
  );
}
