import type { Metadata } from "next";
import { ApiReference } from "@/components/docs/ApiReference";

export const metadata: Metadata = {
  title: "API reference · Dainik Samachar",
  description:
    "Dainik Samachar REST API (Pro): news briefings, stock research, instrument search and newsletters.",
};

export default function ApiDocsPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ApiReference specUrl="/api/v1/openapi.json" />
    </div>
  );
}
