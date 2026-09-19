import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
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
        fontMono.variable,
      )}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ClerkProvider>
          <TooltipProvider>
            <SyncLocalUser />
            <header className="flex items-center justify-between gap-3 border-b border-border/20 bg-background px-6 py-4">
              <a href="/" className="font-display text-lg text-foreground">
                Puja Planner
              </a>
              <div className="flex items-center gap-3">
                <Show when="signed-out">
                  <SignInButton />
                  <SignUpButton />
                </Show>
                <Show when="signed-in">
                  <UserButton />
                </Show>
              </div>
            </header>
            {children}
          </TooltipProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
