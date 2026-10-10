import { Section, SectionHeading } from "@/components/about/AboutPageShell";
import { ACCENT, PRODUCT_FEATURES } from "@/components/about/aboutStory";
import Link from "next/link";

export function FeaturesSection() {
  return (
    <Section id="features">
      <SectionHeading
        eyebrow="What you can do"
        title={
          <>
            Three research paths.
            {" "}
            <br className="hidden sm:block" />
            One stored record.
          </>
        }
        lede="A briefing discovers many stories. Chat answers one question. Asking for a story turns that research into a document you own. Every path writes sources before it writes prose."
      />

      <ol data-about-reveal className="mt-20 grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:mt-28">
        {PRODUCT_FEATURES.map((feature, i) => (
          <li key={feature.name} data-about-item className="border-t border-border/40 pt-5">
            <p className="text-[0.7rem] tracking-[0.18em]" style={{ color: ACCENT }}>
              {String(i + 1).padStart(2, "0")}
            </p>
            <h3 className="font-display mt-2 text-2xl font-normal">
              <Link href={feature.path} className="hover:underline">
                {feature.name}
              </Link>
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {feature.purpose}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
