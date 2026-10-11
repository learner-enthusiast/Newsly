"use client";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { DARK, NAV_COPY, NAV_LINKS, ROUTES } from "@/lib/landing/content";
import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type RefObject } from "react";

const EASE = "cubic-bezier(0.4,0,0.2,1)";
const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white";

export function LandingMobileMenu({
  id,
  open,
  onClose,
  returnFocusRef,
  isSignedIn,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  isSignedIn: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Lock page scroll and manage focus while open; restored on close or unmount.
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    closeRef.current?.focus();
    const opener = returnFocusRef.current;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onEscape);
      body.style.overflow = prevOverflow;
      opener?.focus();
    };
  }, [open, onClose, returnFocusRef]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled])",
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const footerLinks = isSignedIn
    ? [
        { label: NAV_COPY.openApp, href: ROUTES.app },
        { label: NAV_COPY.newsletters, href: ROUTES.newsletters },
      ]
    : [
        { label: NAV_COPY.signIn, href: ROUTES.signIn },
        { label: NAV_COPY.signUp, href: ROUTES.signUp },
      ];

  const transitionDuration = reduced ? "0s" : undefined;

  return (
    <div
      ref={dialogRef}
      id={id}
      role="dialog"
      aria-modal="true"
      aria-label={NAV_COPY.menu}
      inert={!open}
      onKeyDown={onKeyDown}
      className={`pointer-events-auto fixed inset-0 z-[100] ${
        open ? "visible opacity-100" : "invisible opacity-0"
      }`}
      style={{
        backgroundColor: DARK,
        // Visibility flips at once on open (so focus can land) and after the
        // fade on close.
        transition: reduced
          ? "none"
          : `opacity 500ms ${EASE}, visibility 0s linear ${open ? "0ms" : "500ms"}`,
      }}
    >
      <div
        className={`flex h-full flex-col transition-transform duration-500 ${
          open ? "translate-y-0" : "-translate-y-8"
        }`}
        style={{ transitionTimingFunction: EASE, transitionDuration }}
      >
        <div className="flex justify-end px-6 pt-8 sm:px-8 sm:pt-12">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={NAV_COPY.closeMenu}
            className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/30 text-white transition-colors hover:border-white ${FOCUS}`}
          >
            <X size={18} />
          </button>
        </div>

        <nav
          aria-label={NAV_COPY.mobileNav}
          className="flex flex-1 flex-col justify-center px-8 sm:px-12"
        >
          {NAV_LINKS.map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              aria-current={link.active ? "page" : undefined}
              className={`py-3 text-2xl font-light tracking-wide uppercase sm:text-3xl ${
                link.active ? "text-white" : "text-white/60 hover:text-white"
              } ${FOCUS}`}
              style={{
                opacity: open ? 1 : 0,
                transform: open ? "translateY(0)" : "translateY(20px)",
                transition: reduced
                  ? "none"
                  : `opacity 0.5s ${EASE} ${i * 60}ms, transform 0.5s ${EASE} ${i * 60}ms, color 0.15s`,
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex gap-6 px-8 pb-10 sm:px-12">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className={`text-xs tracking-[0.2em] text-white/60 uppercase transition-colors hover:text-white ${FOCUS}`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
