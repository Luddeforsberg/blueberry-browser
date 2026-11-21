import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { siteOf } from "@shared/sites";
import { cn } from "@common/lib/utils";

// Part of the message layout (ChatMessage.tsx): a reply's markdown.

// `fromStranger` is for what someone else wrote: nothing in it can load anything or take you anywhere. An image is
// only its description, a link is its words and its site as text, and raw HTML shows as text, which ReactMarkdown does
// by itself as long as no plugin here parses it.
const STRANGER_COMPONENTS: Components = {
  img: ({ alt }) => <span>{alt}</span>,
  a: ({ children, href }) => {
    const site = href ? siteOf(href) : null;
    const words = String(children);
    if (!site || words === site) return <span>{children}</span>;
    return (
      <span>
        {words === href ? (
          site
        ) : (
          <>
            {children} ({site})
          </>
        )}
      </span>
    );
  },
};

export const Markdown: React.FC<{ content: string; fromStranger?: boolean; className?: string }> = ({
  content,
  fromStranger,
  className,
}) => (
  <div className={cn("prose max-w-none prose-pre:p-3 prose-pre:overflow-x-auto", className)}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        code: ({ node, className, children, ...props }) => {
          const inline = !className;
          return inline ? (
            <code className="bg-sheet-2 px-1 py-0.5 rounded-row" {...props}>
              {children}
            </code>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        a: ({ children, href }) => (
          <a href={href} className="text-ink hover:underline" target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        ...(fromStranger ? STRANGER_COMPONENTS : {}),
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);
