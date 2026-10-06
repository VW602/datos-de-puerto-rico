# Seguridad

## Cómo reportar una vulnerabilidad

**No abras un issue público.**

Usa el reporte privado de GitHub: en la página del repositorio, ve a
**Security → Report a vulnerability**. Solo quien mantiene el proyecto ve el
reporte. Incluye:

- qué encontraste y dónde,
- cómo reproducirlo,
- qué impacto crees que tiene.

Trataré de responder en un plazo de siete días. Cuando haya un arreglo, lo
publicaré y, si quieres, te daré crédito.

## Qué cubre

- El código de este repositorio.
- Los scripts de datos (`scripts/`), que solo se conectan a `www2.census.gov`
  cuando alguien corre `npm run data:census:update` o `npm run data:geo:update`.

## Qué no cubre

- Los sitios de las agencias de donde salen los datos. Repórtale esos problemas a
  cada agencia.
- Errores en las cifras: eso es una corrección de datos (ver
  [CONTRIBUTING.md](CONTRIBUTING.md#corregir-un-dato)).

## Notas

- El sitio no tiene cuentas de usuario, no guarda datos personales y no usa base
  de datos.
- No subas claves, tokens ni archivos `.env` al repositorio. El proceso del Censo
  no necesita clave de API.

---

**English:** Please report vulnerabilities privately through GitHub (Security →
Report a vulnerability), not in a public issue.
