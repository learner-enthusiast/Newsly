/**
 * Daily at 06:00 IST: compare recorded SerpApi / Firecrawl credits with each
 * provider's usage API and store the result (see `reconcileProviderUsage`).
 */

import { inngest } from "@/clients/inngestClient";
import { reconcileProvider } from "@/services/usage/reconcileProviderUsage";

export const PROVIDER_USAGE_RECONCILE_CRON = "TZ=Asia/Kolkata 0 6 * * *";

export const providerUsageReconcileFunction = inngest.createFunction(
  {
    id: "provider-usage-reconcile",
    name: "Provider usage reconcile",
    triggers: [{ cron: PROVIDER_USAGE_RECONCILE_CRON }],
  },
  async ({ step }) => {
    const serpapi = await step.run("reconcile-serpapi", () => reconcileProvider("serpapi"));
    const firecrawl = await step.run("reconcile-firecrawl", () => reconcileProvider("firecrawl"));
    return { serpapi, firecrawl };
  },
);
