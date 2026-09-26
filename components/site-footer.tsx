import Link from "next/link";

const FOOTER_LINKS = [
  { href: "#", label: "About" },
  { href: "#", label: "Blog" },
  { href: "#", label: "Privacy" },
  { href: "#", label: "Terms" },
  { href: "#", label: "Contact" },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="shrink-0 border-t border-border/20 bg-muted/30 px-6 py-8">
      <div className="landing-section flex flex-col gap-6 py-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="font-brand text-lg text-foreground">
            Newsly
          </Link>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="text-xs text-muted-foreground">
          © {year} Newsly. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
