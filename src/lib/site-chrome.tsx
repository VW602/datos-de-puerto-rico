import type { ReactNode } from "react";
import { SITE_NAME } from "./site";

/** The site's name bar and a centered message, for pages outside the explorer (404, errors). */
export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="border-b border-fg px-4 py-1.5 md:px-14 md:py-3">
        <a href="/" className="font-display text-[21px] font-semibold md:text-[26px]">
          {SITE_NAME}
        </a>
      </header>
      <main className="flex flex-1 flex-col items-start gap-3 px-4 py-10 md:px-14 md:py-16">
        {children}
      </main>
    </div>
  );
}
