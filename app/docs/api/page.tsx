import { ApiDocsIntro } from "@/components/docs/ApiDocsIntro";
import { ApiReference } from "@/components/docs/ApiReference";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API reference · Dainik Samachar",
  description:
    "Dainik Samachar REST API (Pro): news briefings, stock research, instrument search and newsletters.",
};

export default function ApiDocsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ApiDocsIntro />
      <ApiReference specUrl="/api/v1/openapi.json" />
    </div>
  );
}
