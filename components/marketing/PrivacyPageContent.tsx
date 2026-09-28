"use client";

import {
  StaticMarketingPage,
  StaticProseSection,
} from "@/components/marketing/StaticMarketingPage";

export function PrivacyPageContent() {
  return (
    <StaticMarketingPage
      eyebrow="Legal"
      title="Privacy policy"
      lead="Last updated: September 2026. This is a simplified summary for the Newsly product; update with your counsel before production launch."
    >
      <StaticProseSection title="Information we collect">
        <p>
          When you sign in, we sync basic profile data from our authentication
          provider (such as email and name) to operate your account. Usage of
          briefings, chat, and stories generates content you create and
          research artifacts stored to provide the service.
        </p>
      </StaticProseSection>
      <StaticProseSection title="How we use data">
        <ul>
          <li>To run news requests, chat research, and story features you ask for.</li>
          <li>To improve reliability, security, and product experience.</li>
          <li>To send in-app notifications about completed jobs when enabled.</li>
        </ul>
      </StaticProseSection>
      <StaticProseSection title="Third-party services">
        <p>
          Newsly relies on external providers for authentication, hosting,
          search, scraping, AI, and background jobs. Those services process
          data according to their own policies when you use features that call
          them.
        </p>
      </StaticProseSection>
      <StaticProseSection title="Your choices">
        <p>
          You can sign out, delete chat sessions, and manage bookmarks and
          stories within the app where those controls exist. For account
          deletion or data export requests, contact us using the details on the{" "}
          <a href="/contact">Contact</a> page.
        </p>
      </StaticProseSection>
      <StaticProseSection title="Contact">
        <p>
          Questions about privacy:{" "}
          <a href="mailto:privacy@newsly.app">privacy@newsly.app</a>
        </p>
      </StaticProseSection>
    </StaticMarketingPage>
  );
}
