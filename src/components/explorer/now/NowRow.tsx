import type { ReactNode } from "react";

/**
 * One row of "Ahora en Puerto Rico": a short label and its content. On wide
 * screens the label sits in its own narrow column so the text keeps a
 * readable measure; on phones it sits above. `attention` draws a rule beside
 * the row (with words in the content saying why), never color alone.
 */
export function NowRow({
  id,
  title,
  attention = false,
  children,
}: {
  id: string;
  title: string;
  attention?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={`grid grid-cols-1 gap-x-8 border-t border-divider py-2.5 lg:grid-cols-[10rem_minmax(0,1fr)] ${attention ? "border-l-4 border-l-accent pl-3" : ""}`}
    >
      <h3 id={id} className="text-xs font-bold tracking-[0.08em] text-muted uppercase lg:pt-1">
        {title}
      </h3>
      <div className="min-w-0 [&>p]:max-w-[72ch] [&>ul]:max-w-[72ch]">{children}</div>
    </section>
  );
}
