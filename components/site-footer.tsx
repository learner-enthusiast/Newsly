export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border/20 bg-muted/30 px-6 py-8">
      <div className="landing-section flex flex-col gap-2 py-0 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-brand text-sm text-foreground">Stock Search</p>
        <p className="text-xs text-muted-foreground">
          © {year} Stock Market Search Engine.
        </p>
      </div>
    </footer>
  );
}
