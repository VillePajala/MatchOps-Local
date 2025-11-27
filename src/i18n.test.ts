import fs from 'fs';
import path from 'path';

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const entries: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      entries.push(...flattenKeys(value as Record<string, unknown>, newKey));
    } else {
      entries.push(newKey);
    }
  }

  return entries;
}

function loadLocale(lang: string) {
  const localePath = path.resolve(__dirname, '..', 'public', 'locales', lang, 'common.json');
  return JSON.parse(fs.readFileSync(localePath, 'utf8')) as Record<string, unknown>;
}

function extractTypeKeys() {
  const typeDefinition = fs.readFileSync(path.resolve(__dirname, 'i18n-types.ts'), 'utf8');
  return [...typeDefinition.matchAll(/\|\s*'([^']+)'/g)].map((match) => match[1]);
}

describe('i18n translation coverage', () => {
  const enTranslations = loadLocale('en');
  const fiTranslations = loadLocale('fi');

  const enKeys = new Set(flattenKeys(enTranslations));
  const fiKeys = new Set(flattenKeys(fiTranslations));

  it('keeps English and Finnish locale keys in sync', () => {
    const missingInFi = [...enKeys].filter((key) => !fiKeys.has(key));
    const missingInEn = [...fiKeys].filter((key) => !enKeys.has(key));

    expect(missingInFi).toEqual([]);
    expect(missingInEn).toEqual([]);
  });

  it('keeps type definitions aligned with locale keys', () => {
    const typeKeys = new Set(extractTypeKeys());

    const missingInTypes = [...enKeys].filter((key) => !typeKeys.has(key));
    const missingInLocales = [...typeKeys].filter((key) => !enKeys.has(key));

    expect(missingInTypes).toEqual([]);
    expect(missingInLocales).toEqual([]);
  });
});
