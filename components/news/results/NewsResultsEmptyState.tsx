"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

export function NewsResultsEmptyState() {
  return (
    <Card className="border-dashed shadow-editorial">
      <CardHeader>
        <CardTitle className="font-display text-xl">No relevant stories found</CardTitle>
        <CardDescription>
          We couldn&apos;t find enough stories matching this request.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="brand-accent" size="sm" nativeButton={false} render={<Link href="/news" />}>
          Create New Request
        </Button>
      </CardContent>
    </Card>
  );
}
