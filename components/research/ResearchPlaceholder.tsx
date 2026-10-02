type ResearchPlaceholderProps = {
  title: string;
  description: string;
};

export function ResearchPlaceholder({
  title,
  description,
}: ResearchPlaceholderProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-12 md:px-6 md:py-16">
      <h1 className="font-display text-3xl tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
