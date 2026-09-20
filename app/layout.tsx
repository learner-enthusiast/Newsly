import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  fontBrand,
  fontDisplay,
  fontHandwritten,
  fontMono,
  fontSans,
} from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { SyncLocalUser } from "./sync-local-user";
import "./globals.css";

export const metadata: Metadata = {
  title: "Puja Planner",
  description:
    "Discover festivals, places, pandals, and food stops — then build an editable route.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased font-sans",
        fontSans.variable,
        fontDisplay.variable,
        fontHandwritten.variable,
        fontBrand.variable,
        fontMono.variable,
      )}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ClerkProvider>
          <TooltipProvider>
            <SyncLocalUser />
            <SiteHeader />
            <div className="flex flex-1 flex-col">{children}</div>
            <SiteFooter />
          </TooltipProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
