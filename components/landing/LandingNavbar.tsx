"use client";

import { LandingMobileMenu } from "@/components/landing/LandingMobileMenu";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { DARK, NAV_COPY, NAV_LINKS, ROUTES } from "@/lib/landing/content";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { Info } from "lucide-react";
import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState } from "react";

const EASE = "cubic-bezier(0.16,1,0.3,1)";
const MENU_ID = "landing-mobile-menu";
const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current";
const LABEL = "text-xs tracking-[0.2em] uppercase font-medium";

/** `isLight` = white type over the darker late frames (p > 0.55). */
export const LandingNavbar = memo(function LandingNavbar({
  isLight,
}: {
  isLight: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const { isSignedIn } = useAuth();
  const [entered, setEntered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setEntered(true), reduced ? 0 : 200);
    return () => window.clearTimeout(id);
  }, [reduced]);

  const entrance = (delay: number) => ({
    opacity: entered ? 1 : 0,
    transform: entered ? "translateY(0)" : "translateY(-12px)",
    transition: reduced
      ? "none"
      : `opacity 0.6s ${EASE} ${delay}ms, transform 0.6s ${EASE} ${delay}ms`,
  });

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    openerRef.current = e.currentTarget;
    setMenuOpen(true);
  };
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const color = isLight ? "#ffffff" : DARK;
  const clusterClass = `flex items-center gap-3 transition-opacity hover:opacity-70 ${LABEL} ${FOCUS}`;
  const clusterContent = (label: string) => (
    <>
      <span>{label}</span>
      <span
        aria-hidden="true"
        className="flex h-5 w-5 items-center justify-center rounded-full bg-current"
      >
        <Info
          size={10}
          className="transition-colors duration-500"
          style={{ color: isLight ? DARK : "#ffffff" }}
        />
      </span>
    </>
  );

  return (
    <nav
      aria-label={NAV_COPY.mainNav}
      className="pointer-events-auto absolute top-0 right-0 left-0 z-50 flex items-center justify-between px-6 pt-8 pb-6 transition-colors duration-500 sm:px-8 sm:pt-12 md:px-12"
      style={{ color }}
    >
      {/* Desktop links */}
      <ul className="hidden items-center gap-8 lg:flex xl:gap-10">
        {NAV_LINKS.map((link, i) => (
          <li key={link.href} style={entrance(i * 80 + 100)}>
            <Link
              href={link.href}
              aria-current={link.active ? "page" : undefined}
              className={`relative block text-xs font-medium tracking-[0.15em] uppercase transition-opacity hover:opacity-70 ${FOCUS}`}
            >
              {link.label}
              {link.active ? (
                <span className="absolute -bottom-3 left-0 h-[2px] w-full bg-current" />
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      {/* Hamburger (below lg) */}
      <button
        type="button"
        onClick={openMenu}
        aria-label={NAV_COPY.openMenu}
        aria-expanded={menuOpen}
        aria-controls={MENU_ID}
        className={`flex flex-col gap-[5px] lg:hidden ${FOCUS}`}
        style={entrance(100)}
      >
        <span className="block h-[2px] w-6 bg-current" />
        <span className="block h-[2px] w-6 bg-current" />
        <span className="block h-[2px] w-4 bg-current" />
      </button>

      {/* Right cluster (sm+) */}
      <div className="hidden items-center gap-8 sm:flex" style={entrance(500)}>
        {isSignedIn ? (
          <Link href={ROUTES.app} className={clusterClass}>
            {clusterContent(NAV_COPY.openApp)}
          </Link>
        ) : (
          <SignInButton mode="modal">
            <button type="button" className={clusterClass}>
              {clusterContent(NAV_COPY.signIn)}
            </button>
          </SignInButton>
        )}
        <span className={`hidden lg:inline ${LABEL}`}>{NAV_COPY.menu}</span>
        <button
          type="button"
          onClick={openMenu}
          aria-expanded={menuOpen}
          aria-controls={MENU_ID}
          className={`transition-opacity hover:opacity-70 lg:hidden ${LABEL} ${FOCUS}`}
        >
          {NAV_COPY.menu}
        </button>
      </div>

      <LandingMobileMenu
        id={MENU_ID}
        open={menuOpen}
        onClose={closeMenu}
        returnFocusRef={openerRef}
        isSignedIn={Boolean(isSignedIn)}
      />
    </nav>
  );
});
