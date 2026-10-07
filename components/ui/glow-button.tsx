"use client";

/**
 * The glow button: the one button that sets the AI to work ("Create the
 * tour"). Mint, with a slowly turning glow around its edge and a soft halo;
 * it squeezes for 200ms when pressed. Styles are .glow-btn in globals.css.
 *
 * Integrated from a shadcn-style component; `disabled` is added, because the
 * tour cannot be built until there is somewhere to start.
 */

import { Sparkles } from "lucide-react";
import { forwardRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ComponentProps {
  label?: string;
  onClick?(): void;
  disabled?: boolean;
  className?: string;
}

export const Component = forwardRef<HTMLButtonElement, ComponentProps>(
  ({ label = "Generate", onClick, disabled, className }, ref) => {
    const [isClicked, setIsClicked] = useState(false);

    const handleClick = () => {
      setIsClicked(true);
      setTimeout(() => setIsClicked(false), 200);
      onClick?.();
    };

    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        disabled={disabled}
        className={cn("glow-btn", className)}
        onClick={handleClick}
        data-state={isClicked ? "clicked" : undefined}
      >
        <span className="flex items-center justify-center gap-1.5">
          {label}
          <Sparkles size={16} className="ml-0.5" aria-hidden="true" />
        </span>
      </button>
    );
  },
);

Component.displayName = "GlowButton";

/** The same, under a name that says what it is. */
export { Component as GlowButton };
