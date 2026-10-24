import {
  LANDING_FOOTER_LINKS,
  LANDING_SOCIAL_LABELS,
  SIGNED_IN_FOOTER_LINKS,
} from "@/components/landing/LandingFooter";
import { Show } from "@clerk/nextjs";
import Link from "next/link";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="shrink-0 border-t border-border/20 bg-muted/30 px-6 py-8 max-sm:px-0 max-sm:py-2">
      <div className="landing-section flex flex-col gap-6 py-0 max-sm:gap-0">
        <div className="flex flex-col gap-6 max-sm:gap-0 sm:flex-row sm:items-start sm:justify-between">
          <Link href="/" className="font-brand text-lg text-foreground max-sm:hidden">
            Newsly
          </Link>
          <nav
            className="flex flex-wrap gap-x-5 gap-y-2 max-sm:justify-center max-sm:gap-x-4 max-sm:gap-y-1"
            aria-label="Footer"
          >
            {LANDING_FOOTER_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground max-sm:text-xs"
              >
                {link.label}
              </Link>
            ))}
            <Show when="signed-in">
              {SIGNED_IN_FOOTER_LINKS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground max-sm:text-xs"
                >
                  {link.label}
                </Link>
              ))}
            </Show>
          </nav>
          <div
            className="flex flex-wrap gap-3 text-sm text-muted-foreground max-sm:hidden"
            aria-label="Social media (links coming soon)"
          >
            {LANDING_SOCIAL_LABELS.map((label) => (
              <span
                key={label}
                className="cursor-default opacity-70"
                title={`${label} — link coming soon`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground max-sm:hidden">
          © {year} Newsly. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
