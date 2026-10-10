import type { ReactNode } from "react";

export function LandingBlock({
  id,
  children,
  className = "",
  rule = true,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  rule?: boolean;
}) {
  return (
    <section
      id={id}
      className={`${rule ? "border-t border-border/25" : ""} py-24 sm:py-28 lg:py-32 ${className}`}
    >
      <div className="landing-section">{children}</div>
    </section>
  );
}

export function LandingEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.75rem] font-medium tracking-[0.2em] text-[#c85d3f] uppercase">
      {children}
    </p>
  );
}
