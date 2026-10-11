import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";
import { SitePage } from "./site-chrome";

/**
 * Readers get a short Spanish message and a way to recover, never the raw
 * error. In development the technical detail stays visible (and in the
 * console) so problems are not hidden while working on the site.
 */
export function AppErrorComponent({ error }: ErrorComponentProps) {
  const dev = import.meta.env.DEV;
  useEffect(() => {
    if (dev) console.error(error);
  }, [dev, error]);
  return (
    <SitePage>
      <h1 className="font-display text-[38px] leading-tight font-medium md:text-5xl">
        Algo salió mal
      </h1>
      <p className="max-w-prose text-base text-muted">
        No se pudo mostrar esta página. Vuelve a cargarla; si el problema sigue, inténtalo más
        tarde.
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex min-h-11 items-center rounded-[3px] border border-fg px-4 text-[15px] font-semibold"
        >
          Volver a cargar
        </button>
        <a href="/" className="flex min-h-11 items-center text-[15px] font-semibold text-accent">
          Ir al inicio
        </a>
      </div>
      {dev && (
        <pre
          data-dev-error
          className="mt-4 max-w-full text-[13px] whitespace-pre-wrap text-muted [overflow-wrap:anywhere]"
        >
          {error instanceof Error ? (error.stack ?? error.message) : String(error)}
        </pre>
      )}
    </SitePage>
  );
}
