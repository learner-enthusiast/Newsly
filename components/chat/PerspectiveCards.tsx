"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ParsedPerspective } from "@/services/chat/parseAssistantMessage";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";

type PerspectiveCardsProps = {
  perspectives: ParsedPerspective[];
};

export function PerspectiveCards({ perspectives }: PerspectiveCardsProps) {
  if (perspectives.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Different Perspectives</h4>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {perspectives.map((perspective) => (
          <Card key={perspective.title} size="sm" className="border-border/60 bg-card/90">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{perspective.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ChatMarkdown content={perspective.body} className="text-sm" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
