export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border/20 bg-muted/30 px-6 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-display text-sm text-foreground">Puja Planner</p>
        <p className="text-xs text-muted-foreground">
          Festival routes, pandals, and food stops — research-backed itineraries.
        </p>
        <p className="text-xs text-muted-foreground">
          © {year} Puja Planner. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
