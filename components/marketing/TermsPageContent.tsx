"use client";

import {
  StaticMarketingPage,
  StaticProseSection,
} from "@/components/marketing/StaticMarketingPage";

export function TermsPageContent() {
  return (
    <StaticMarketingPage
      eyebrow="Legal"
      title="Terms of use"
      lead="Last updated: September 2026. Plain-language terms for using Newsly; have legal review before relying on them commercially."
    >
      <StaticProseSection title="Acceptance">
        <p>
          By accessing or using Newsly, you agree to these terms. If you do not
          agree, do not use the service.
        </p>
      </StaticProseSection>
      <StaticProseSection title="The service">
        <p>
          Newsly provides news discovery, research chat, and story tools using
          automated search and AI. Outputs may be incomplete or incorrect; you
          are responsible for verifying important information against primary
          sources.
        </p>
      </StaticProseSection>
      <StaticProseSection title="Your content">
        <p>
          You retain rights to content you create. You grant us the license
          needed to host, process, and display it to operate the product (for
          example, published stories you choose to make public).
        </p>
      </StaticProseSection>
      <StaticProseSection title="Acceptable use">
        <ul>
          <li>No unlawful, abusive, or automated abuse of APIs or rate limits.</li>
          <li>No attempts to bypass security or access others&apos; private data.</li>
          <li>Respect intellectual property of sources and third parties.</li>
        </ul>
      </StaticProseSection>
      <StaticProseSection title="Disclaimer">
        <p>
          The service is provided &quot;as is&quot; without warranties. We are not
          liable for indirect or consequential damages to the extent permitted
          by law.
        </p>
      </StaticProseSection>
      <StaticProseSection title="Changes">
        <p>
          We may update these terms; continued use after changes constitutes
          acceptance. Material changes will be noted in-product or on this page.
        </p>
      </StaticProseSection>
    </StaticMarketingPage>
  );
}
