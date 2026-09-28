"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  StaticMarketingPage,
  StaticProseSection,
} from "@/components/marketing/StaticMarketingPage";
import { Mail, MapPin } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

export function ContactPageContent() {
  const [sent, setSent] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(true);
    toast.success("Thanks—we'll get back to you soon.", {
      description: "This demo form does not send email yet. Use the address below for real inquiries.",
    });
  }

  return (
    <StaticMarketingPage
      eyebrow="Contact"
      title="Get in touch"
      lead="Questions about Newsly, partnerships, or support—we read every message."
      className="max-w-3xl"
    >
      <div className="grid gap-10 lg:grid-cols-[1fr,minmax(0,22rem)] lg:items-start">
        <StaticProseSection title="Write to us">
          <ul className="space-y-4 not-prose">
            <li className="flex gap-3">
              <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <strong className="text-foreground">General</strong>
                <br />
                <a href="mailto:hello@newsly.app">hello@newsly.app</a>
              </span>
            </li>
            <li className="flex gap-3">
              <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <strong className="text-foreground">Privacy</strong>
                <br />
                <a href="mailto:privacy@newsly.app">privacy@newsly.app</a>
              </span>
            </li>
            <li className="flex gap-3">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <strong className="text-foreground">Remote-first</strong>
                <br />
                Built by a distributed team; no public office hours.
              </span>
            </li>
          </ul>
        </StaticProseSection>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-border/40 bg-card/80 p-6 shadow-[var(--shadow-paper)]"
        >
          <p className="text-sm font-medium text-foreground">Send a message</p>
          <div className="space-y-2">
            <label htmlFor="contact-name" className="text-xs text-muted-foreground">
              Name
            </label>
            <Input
              id="contact-name"
              name="name"
              required
              autoComplete="name"
              placeholder="Your name"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="contact-email" className="text-xs text-muted-foreground">
              Email
            </label>
            <Input
              id="contact-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="contact-message" className="text-xs text-muted-foreground">
              Message
            </label>
            <Textarea
              id="contact-message"
              name="message"
              required
              rows={4}
              placeholder="How can we help?"
            />
          </div>
          <Button type="submit" className="w-full" disabled={sent}>
            {sent ? "Message recorded" : "Send message"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Static demo—use email links for production support.
          </p>
        </form>
      </div>
    </StaticMarketingPage>
  );
}
