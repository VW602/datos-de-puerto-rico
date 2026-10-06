# Cómo contribuir

Gracias por querer ayudar. Este proyecto mejora cada vez que alguien corrige un
dato, encuentra una fuente oficial o hace la página más fácil de usar.

Puedes escribir en español o en inglés.

## Qué tipo de ayuda sirve

- **Correcciones de datos:** una cifra que no cuadra con su fuente oficial, o un
  municipio con nombre, código o límite equivocado.
- **Fuentes oficiales nuevas:** publicaciones por municipio con términos de uso
  claros (ver [Datos](#datos)).
- **Procesos reproducibles:** un script que descargue una fuente oficial, guarde la
  copia con su SHA-256 y genere los datos sin internet, como `scripts/census` y
  `scripts/geo`.
- **Accesibilidad:** teclado, lectores de pantalla, contraste, móvil.
- **Visualización:** mejoras al mapa o a la ficha del municipio.
- **Código:** errores, rendimiento, pruebas.
- **Documentación y texto:** que se entienda mejor, sin jerga innecesaria.

## Antes de empezar

1. Busca si ya hay un issue sobre el tema.
2. Para cambios grandes, abre un issue primero y explica la idea.
3. Corre el proyecto (ver el [README](README.md)) y asegúrate de que pase:

   ```bash
   npm run check
   ```

## Datos

Toda cifra nueva o corregida tiene que traer evidencia:

| Campo | Ejemplo |
| --- | --- |
| **Fuente** | American Community Survey 2020–2024, tabla B17001 |
| **URL** | Enlace directo a la publicación o al archivo (no a la portada de la agencia) |
| **Agencia** | U.S. Census Bureau |
| **Periodo** | 2020–2024, estimado de 5 años |
| **Nivel geográfico** | Municipio o toda la isla |
| **Términos de uso** | Enlace a la licencia o los términos escritos de la fuente |
| **Transformación** | Qué se hace con el número: copiarlo, sumar, sacar un por ciento |

«Lo encontré en internet» o una captura de pantalla de un tablero no es suficiente.

Reglas:

- **Fuente primaria.** La agencia que produce el dato, no un periódico, un
  agregador ni un tablero de terceros.
- **Términos escritos.** Una fuente solo entra si sus términos permiten mostrar y
  redistribuir los datos. Que sea del gobierno no basta. Si no está claro, abre un
  issue antes de escribir código.
- **No rellenes.** Si la fuente no publica la cifra para un municipio, déjala en
  `null`. Nunca pongas 0 en lugar de un dato que falta.
- **No cambies el significado.** Si simplificas una etiqueta, la medida tiene que
  seguir siendo la misma.
- **Describe, no califiques.** Nada de decir qué municipio, gobierno o grupo está
  «mejor» o «peor».
- **Registra la fuente.** Toda fuente nueva lleva una entrada en
  `data/registry/sources.json` (el esquema está en `data/schemas/`), una sección en
  `DATA_SOURCES.md` y sus términos en `DATA_LICENSES.md`. Las pruebas fallan si una
  medida no tiene fuente lista para publicarse.

### Corregir un dato

Abre un issue con:

1. el municipio y la medida,
2. la cifra que muestra el sitio,
3. la cifra de la fuente oficial,
4. el enlace a esa fuente y la página o tabla donde está.

## Código

- TypeScript estricto, React y Tailwind. Sigue el estilo del archivo que tocas.
- `npm run format` aplica Prettier.
- Las reglas de datos (rankings, datos que faltan, frontera de publicación) van en
  `src/data/pr/`, con pruebas al lado (`*.test.ts`).
- El texto que ve la gente va en español claro. Si un término técnico hace falta,
  explícalo en la pista de la medida.

## Pull requests

- Un tema por PR.
- Explica qué cambia y por qué. Si toca datos, incluye la fuente.
- Si cambia algo visible, añade una captura antes y después.

## Conducta

Este proyecto sigue un [código de conducta](CODE_OF_CONDUCT.md).
