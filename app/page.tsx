import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const { userId } = await auth();

  return (
    <main className="landing-section flex flex-1 flex-col gap-6 py-16 md:py-24">
      <h1 className="text-display text-3xl text-foreground md:text-4xl">
        {userId ? "Welcome back" : "Sign in to continue"}
      </h1>
      <p className="max-w-xl text-base text-muted-foreground md:text-lg">
        {userId
          ? "The application shell is ready. New research and content workflows will be added here."
          : "Authentication is enabled. Sign in or create an account to access protected routes."}
      </p>
      {!userId ? (
        <div className="flex flex-wrap items-center gap-3">
          <SignInButton mode="modal">
            <Button type="button" variant="outline">
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button type="button" variant="brand">
              Sign up
            </Button>
          </SignUpButton>
        </div>
      ) : null}
    </main>
  );
}
