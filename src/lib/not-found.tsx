import { SitePage } from "./site-chrome";

export function NotFoundPage() {
  return (
    <SitePage>
      <p className="text-xs font-bold tracking-[0.09em] text-accent uppercase md:text-[13px]">
        Error 404
      </p>
      <h1 className="font-display text-[38px] leading-tight font-medium md:text-5xl">
        Página no encontrada
      </h1>
      <p className="max-w-prose text-base text-muted">
        Esta dirección no existe en el sitio. Los datos de los 78 municipios están en la página
        principal.
      </p>
      <a href="/" className="flex min-h-11 items-center text-[15px] font-semibold text-accent">
        Volver al inicio
      </a>
    </SitePage>
  );
}
