import { NewslyLandingPage } from "@/components/landing/NewslyLandingPage";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect("/news");
  }

  return <NewslyLandingPage />;
}
