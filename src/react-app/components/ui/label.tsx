import * as React from "react"
import { cn } from "@/react-app/lib/utils"
import { Label as LabelPrimitive } from "radix-ui"

function Label({
  className,
  required,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & { required?: boolean }) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-xs/relaxed leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      {required ? (
        <span className="-ml-1 text-destructive" aria-hidden="true">
          *
        </span>
      ) : null}
    </LabelPrimitive.Root>
  )
}

export { Label }
