export default function HomePage() {
  return (
    <main className="landing-section flex flex-1 flex-col items-center justify-center py-24 text-center">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Stock Market Search Engine
      </h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        Request daily market news by region or world scope.
      </p>
      <a
        href="/news"
        className="mt-8 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Open news research
      </a>
    </main>
  );
}
