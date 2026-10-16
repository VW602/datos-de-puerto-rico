import type { Locale } from "./locale.ts";

/**
 * The shape the English side must match: every string in the Spanish source
 * becomes "some string", functions keep their parameters, nested groups keep
 * their keys. Missing or extra keys in English are type errors.
 */
export type Messages<T> = T extends string
  ? string
  : T extends (...args: never[]) => unknown
    ? T
    : T extends readonly (infer U)[]
      ? readonly Messages<U>[]
      : T extends object
        ? { readonly [K in keyof T]: Messages<T[K]> }
        : T;

/**
 * One feature's interface text, Spanish (the source) and English side by
 * side. Spanish is the reference shape; English must match it key for key.
 */
export function defineMessages<const T>(messages: {
  es: T;
  en: NoInfer<Messages<T>>;
}): Record<Locale, Messages<T>> {
  return messages as Record<Locale, Messages<T>>;
}
