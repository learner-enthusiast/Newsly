import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import type { ReactNode } from "react";
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
  title: "Stock Market Search Engine",
  description: "Stock market search — coming soon.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
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
      <body className="h-dvh overflow-hidden bg-background text-foreground">
        <ClerkProvider>
          <TooltipProvider>
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <SyncLocalUser />
              <SiteHeader />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {children}
              </div>
              <SiteFooter />
            </div>
          </TooltipProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
