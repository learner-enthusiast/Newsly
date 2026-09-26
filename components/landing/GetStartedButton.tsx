"use client";

import { Button } from "@/components/ui/button";
import { SignUpButton } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import type { ComponentProps } from "react";

type GetStartedButtonProps = {
  className?: string;
  size?: ComponentProps<typeof Button>["size"];
  label?: string;
};

export function GetStartedButton({
  className,
  size = "lg",
  label = "Get Started Free",
}: GetStartedButtonProps) {
  return (
    <SignUpButton mode="modal">
      <Button variant="brand-accent" size={size} className={className}>
        {label}
        <ArrowRight data-icon="inline-end" />
      </Button>
    </SignUpButton>
  );
}
