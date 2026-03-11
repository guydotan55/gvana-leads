import he from "./dictionaries/he.json";
import en from "./dictionaries/en.json";
import { clientConfig } from "@/client.config";

const dictionaries = { he, en } as const;

type DictionaryKey = keyof typeof he;

export function t(key: DictionaryKey): string {
  const dict = dictionaries[clientConfig.locale];
  return dict[key] || key;
}

export function getDictionary() {
  return dictionaries[clientConfig.locale];
}
