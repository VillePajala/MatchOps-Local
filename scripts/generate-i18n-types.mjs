import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const baseLang = 'en';
const translationPath = path.resolve('public/locales', baseLang, 'common.json');
const data = JSON.parse(readFileSync(translationPath, 'utf8'));

function flatten(obj, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flatten(value, newKey));
    } else {
      keys.push(newKey);
    }
  }
  return keys;
}

const flat = flatten(data);

// i18next pluralization: callers invoke `t('foo', { count })` against the
// base key (`foo`), but the JSON only stores `foo_one`/`foo_other`. Synthesize
// the base so dynamic-key call sites can assert against it via TranslationKey.
const synthesizedBases = new Set();
for (const key of flat) {
  const m = key.match(/^(.*)_(one|other|two|few|many|zero)$/);
  if (m) synthesizedBases.add(m[1]);
}

const keys = [...new Set([...flat, ...synthesizedBases])].sort();

const typeDef = `// AUTO-GENERATED FILE - DO NOT EDIT\n` +
  `export type TranslationKey =\n${keys.map(k => `  | '${k}'`).join('\n')};\n`;

writeFileSync('src/i18n-types.ts', typeDef);
console.log(`Generated src/i18n-types.ts with ${keys.length} keys`);

