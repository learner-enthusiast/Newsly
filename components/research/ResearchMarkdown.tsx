"use client";

import { cn } from "@/lib/utils";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const researchMarkdownComponents: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline underline-offset-2 hover:opacity-90"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => (
    <h1 className="mt-5 mb-3 font-display text-xl font-semibold first:mt-0 md:text-2xl">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2 font-display text-lg font-semibold first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-2 text-base font-semibold first:mt-0">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mb-3 leading-relaxed last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1.5 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1.5 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-primary/30 pl-4 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-border" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-muted/80 px-3 py-2 font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-3 py-2 align-top">{children}</td>
  ),
  code: ({ className, children }) => {
    const inline = !className;
    if (inline) {
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">
          {children}
        </code>
      );
    }
    return (
      <code className={cn("font-mono text-sm", className)}>{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-md border bg-muted/60 p-4 font-mono text-sm">
      {children}
    </pre>
  ),
};

type ResearchMarkdownProps = {
  content: string;
  className?: string;
  /** Scrollport max height (Tailwind classes). */
  maxHeightClassName?: string;
};

export function ResearchMarkdown({
  content,
  className,
  maxHeightClassName = "max-h-[min(70dvh,42rem)]",
}: ResearchMarkdownProps) {
  return (
    <div
      className={cn(
        "overflow-y-auto overscroll-y-contain pr-1",
        maxHeightClassName,
      )}
    >
      <div
        className={cn(
          "text-[15px] leading-relaxed text-foreground [&>*:first-child]:mt-0",
          className,
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={researchMarkdownComponents}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
