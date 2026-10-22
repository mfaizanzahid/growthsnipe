import { useState } from "react";
import { cn } from "../lib/utils";

/**
 * App brand: image logo when public/logo.png exists, portal-name text
 * otherwise. Never renders both — pass the name, not a sibling label.
 */
export function BrandLogo({
  name,
  textClassName,
  className,
  imgClassName,
}: {
  name: string;
  textClassName?: string;
  className?: string;
  imgClassName?: string;
}) {
  const [missing, setMissing] = useState(false);
  if (missing) return <span className={textClassName}>{name}</span>;
  return (
    <img
      src="/logo.png"
      alt={name}
      onError={() => setMissing(true)}
      className={cn("h-6 w-auto", imgClassName, className)}
    />
  );
}
