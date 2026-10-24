import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { ClerkModalBridge } from "@/components/auth/ClerkModalBridge";
import { HideOnLanding } from "@/components/nav/HideOnLanding";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";
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
  title: "Newsly",
  description: "Generate and explore daily news briefings.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      // The landing (`/`) scrolls smoothly; this lets Next disable it during route changes.
      data-scroll-behavior="smooth"
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
            <div data-app-shell className="flex h-full min-h-0 flex-col overflow-hidden">
              <SyncLocalUser />
              <Suspense fallback={null}>
                <ClerkModalBridge />
              </Suspense>
              <SiteHeader />
              <div data-app-shell className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {children}
              </div>
              <HideOnLanding>
                <SiteFooter />
              </HideOnLanding>
              <Toaster richColors closeButton position="top-center" />
            </div>
          </TooltipProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
