import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { cn } from "@/react-app/lib/utils";

/** Inline pending indicator for async actions. */
export function Spinner({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  if (label) {
    return (
      <span role="status" aria-label={label} className="inline-flex items-center">
        <ArrowPathIcon aria-hidden="true" className={cn("size-3.5 animate-spin", className)} />
      </span>
    );
  }
  return <ArrowPathIcon aria-hidden="true" className={cn("size-3.5 animate-spin", className)} />;
}
