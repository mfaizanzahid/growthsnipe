import { XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/react-app/lib/utils";
import { Button } from "./button";
import { Input } from "./input";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/** Search input with an inline clear button when a value is present. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel = "Search",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="pr-8"
      />
      {value !== "" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              aria-label="Clear search"
              onClick={() => onChange("")}
            >
              <XMarkIcon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear search</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
