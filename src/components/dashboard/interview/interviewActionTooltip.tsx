"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Portal } from "@radix-ui/react-tooltip";
import type { ReactElement } from "react";

export default function InterviewActionTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <Portal>
          <TooltipContent side="bottom" sideOffset={6} className="bg-slate-900 text-white">
            {label}
          </TooltipContent>
        </Portal>
      </Tooltip>
    </TooltipProvider>
  );
}
