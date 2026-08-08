import "server-only";
import { cache } from "react";
import type en from "./dictionaries/en.json";
import languine from "./languine.json" with { type: "json" };

export const locales = [
  languine.locale.source,
  ...languine.locale.targets,
] as const;

export type Locale = (typeof locales)[number];

export type Dictionary = typeof en;

const dictionaries: Record<string, () => Promise<Dictionary>> =
  Object.fromEntries(
    locales.map((locale) => [
      locale,
      async (): Promise<Dictionary> => {
        try {
          return (await import(`./dictionaries/${locale}.json`)).default;
        } catch {
          return (await import("./dictionaries/en.json")).default;
        }
      },
    ])
  );

const isValidLocale = (locale: string): locale is Locale =>
  locales.includes(locale as Locale);

export const getDictionary = cache(
  async (locale: string): Promise<Dictionary> => {
    const [normalizedLocale] = locale.split("-");

    if (!isValidLocale(normalizedLocale)) {
      return dictionaries.en();
    }

    try {
      return await dictionaries[normalizedLocale]();
    } catch {
      return dictionaries.en();
    }
  }
);
