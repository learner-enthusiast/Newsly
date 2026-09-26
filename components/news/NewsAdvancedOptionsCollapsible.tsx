"use client";

import { cn } from "@/lib/utils";
import gsap from "gsap";
import { ChevronDown } from "lucide-react";
import {
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";

type NewsAdvancedOptionsCollapsibleProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
};

export function NewsAdvancedOptionsCollapsible({
  open,
  onOpenChange,
  children,
  className,
}: NewsAdvancedOptionsCollapsibleProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLSpanElement>(null);
  const skipAnimationRef = useRef(true);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const chevron = chevronRef.current;
    if (!panel) {
      return;
    }

    gsap.killTweensOf([panel, chevron].filter(Boolean));

    const applyInstant = (isOpen: boolean) => {
      gsap.set(panel, {
        height: isOpen ? "auto" : 0,
        opacity: isOpen ? 1 : 0,
        overflow: isOpen ? "visible" : "hidden",
        display: isOpen ? "flex" : "none",
      });
      if (chevron) {
        gsap.set(chevron, { rotation: isOpen ? 180 : 0 });
      }
    };

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (skipAnimationRef.current) {
      skipAnimationRef.current = false;
      applyInstant(open);
      return;
    }

    if (reduceMotion) {
      applyInstant(open);
      return;
    }

    if (open) {
      gsap.set(panel, { display: "flex", overflow: "hidden" });
      gsap.fromTo(
        panel,
        { height: 0, opacity: 0.65 },
        {
          height: "auto",
          opacity: 1,
          duration: 0.38,
          ease: "power2.out",
          onComplete: () => {
            gsap.set(panel, { height: "auto", overflow: "visible" });
          },
        },
      );
      if (chevron) {
        gsap.to(chevron, {
          rotation: 180,
          duration: 0.32,
          ease: "power2.out",
        });
      }
    } else {
      gsap.set(panel, { overflow: "hidden" });
      gsap.to(panel, {
        height: 0,
        opacity: 0,
        duration: 0.28,
        ease: "power2.inOut",
        onComplete: () => {
          gsap.set(panel, { display: "none" });
        },
      });
      if (chevron) {
        gsap.to(chevron, {
          rotation: 0,
          duration: 0.28,
          ease: "power2.inOut",
        });
      }
    }
  }, [open]);

  return (
    <div
      className={cn(
        "mb-2 rounded-lg border border-border/60 bg-muted/20",
        className,
      )}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        Advanced options
        <span ref={chevronRef} className="inline-flex shrink-0 text-muted-foreground">
          <ChevronDown />
        </span>
      </button>
      <div
        ref={panelRef}
        className="flex flex-col gap-4 border-t border-border/60 px-4 py-4"
        style={{ display: open ? "flex" : "none", overflow: "hidden" }}
      >
        {children}
      </div>
    </div>
  );
}
