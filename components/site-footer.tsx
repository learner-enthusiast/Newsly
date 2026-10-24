import {
  LANDING_FOOTER_LINKS,
  LANDING_SOCIAL_LABELS,
} from "@/components/landing/LandingFooter";
import Link from "next/link";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="shrink-0 border-t border-border/20 bg-muted/30 px-6 py-8">
      <div className="landing-section flex flex-col gap-6 py-0">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <Link href="/" className="font-brand text-lg text-foreground">
            Newsly
          </Link>
          <nav
            className="flex flex-wrap gap-x-5 gap-y-2"
            aria-label="Footer"
          >
            {LANDING_FOOTER_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div
            className="flex flex-wrap gap-3 text-sm text-muted-foreground"
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
        <p className="text-xs text-muted-foreground">
          © {year} Newsly. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
