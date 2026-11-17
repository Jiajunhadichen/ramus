import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full  border border-rule bg-transparent px-3 py-2 text-ui  placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ink disabled:cursor-not-allowed disabled:opacity-50 md:text-ui",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
