import { useId, useState, type ReactNode } from "react";

/**
 * A button that shows or hides a region right below it. The region's content
 * is rendered only while it is open, so what it loads (maps, long lists, the
 * water series) is fetched only when the reader asks for it. No animation.
 */
export function Disclosure({
  label,
  children,
  defaultOpen = false,
  className = "",
}: {
  label: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 items-center gap-1.5 text-left font-semibold text-accent"
      >
        <span aria-hidden="true" className="inline-block w-3 text-[12px]">
          {open ? "▾" : "▸"}
        </span>
        {label}
      </button>
      <div id={id} hidden={!open}>
        {open && children}
      </div>
    </div>
  );
}
