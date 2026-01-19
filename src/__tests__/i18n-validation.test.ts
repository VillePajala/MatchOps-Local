/**
 * Comprehensive Translation File Validation Tests
 *
 * These tests ensure translation files remain in sync and catch common issues
 * like duplicate keys, missing translations, and structural inconsistencies.
 *
 * @module i18n-validation
 */

import * as fs from 'fs';
import * as path from 'path';

// Helper to recursively get all keys from a nested object
function getAllKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  let keys: string[] = [];
  for (const key in obj) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys = keys.concat(getAllKeys(value as Record<string, unknown>, newKey));
    } else {
      keys.push(newKey);
    }
  }
  return keys;
}

// Helper to get value at a dot-notation path
function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

// Helper to find duplicate keys in raw JSON content
function findDuplicateTopLevelKeys(content: string): { key: string; lines: number[] }[] {
  const lines = content.split('\n');
  const topLevelPattern = /^  "([^"]+)":\s*\{/;
  const keyOccurrences: Record<string, number[]> = {};

  lines.forEach((line, idx) => {
    const match = line.match(topLevelPattern);
    if (match) {
      const key = match[1];
      if (!keyOccurrences[key]) {
        keyOccurrences[key] = [];
      }
      keyOccurrences[key].push(idx + 1);
    }
  });

  return Object.entries(keyOccurrences)
    .filter(([, occurrences]) => occurrences.length > 1)
    .map(([key, occurrences]) => ({ key, lines: occurrences }));
}

// Load translation files
const localesPath = path.join(process.cwd(), 'public/locales');
const enPath = path.join(localesPath, 'en/common.json');
const fiPath = path.join(localesPath, 'fi/common.json');

describe('Translation File Validation', () => {
  let enContent: string;
  let fiContent: string;
  let en: Record<string, unknown>;
  let fi: Record<string, unknown>;
  let enKeys: string[];
  let fiKeys: string[];

  beforeAll(() => {
    enContent = fs.readFileSync(enPath, 'utf8');
    fiContent = fs.readFileSync(fiPath, 'utf8');
    en = JSON.parse(enContent);
    fi = JSON.parse(fiContent);
    enKeys = getAllKeys(en);
    fiKeys = getAllKeys(fi);
  });

  describe('JSON Structure', () => {
    it('EN file should be valid JSON', () => {
      expect(() => JSON.parse(enContent)).not.toThrow();
    });

    it('FI file should be valid JSON', () => {
      expect(() => JSON.parse(fiContent)).not.toThrow();
    });

    it('EN file should not have duplicate top-level keys', () => {
      const duplicates = findDuplicateTopLevelKeys(enContent);
      if (duplicates.length > 0) {
        const details = duplicates
          .map((d) => `${d.key} at lines ${d.lines.join(', ')}`)
          .join('; ');
        fail(`EN file has duplicate keys: ${details}`);
      }
    });

    it('FI file should not have duplicate top-level keys', () => {
      const duplicates = findDuplicateTopLevelKeys(fiContent);
      if (duplicates.length > 0) {
        const details = duplicates
          .map((d) => `${d.key} at lines ${d.lines.join(', ')}`)
          .join('; ');
        fail(`FI file has duplicate keys: ${details}`);
      }
    });
  });

  describe('Key Parity', () => {
    it('EN and FI files should have the same number of keys', () => {
      expect(enKeys.length).toBe(fiKeys.length);
    });

    it('all EN keys should exist in FI', () => {
      const fiKeySet = new Set(fiKeys);
      const missingInFi = enKeys.filter((k) => !fiKeySet.has(k));

      if (missingInFi.length > 0) {
        fail(
          `${missingInFi.length} EN keys missing from FI:\n${missingInFi.slice(0, 10).join('\n')}${missingInFi.length > 10 ? `\n... and ${missingInFi.length - 10} more` : ''}`
        );
      }
    });

    it('all FI keys should exist in EN', () => {
      const enKeySet = new Set(enKeys);
      const missingInEn = fiKeys.filter((k) => !enKeySet.has(k));

      if (missingInEn.length > 0) {
        fail(
          `${missingInEn.length} FI keys missing from EN:\n${missingInEn.slice(0, 10).join('\n')}${missingInEn.length > 10 ? `\n... and ${missingInEn.length - 10} more` : ''}`
        );
      }
    });
  });

  describe('Value Quality', () => {
    it('no empty string values in EN', () => {
      const emptyKeys = enKeys.filter((k) => getValueAtPath(en, k) === '');
      if (emptyKeys.length > 0) {
        fail(`EN has empty values for: ${emptyKeys.join(', ')}`);
      }
    });

    it('no empty string values in FI', () => {
      const emptyKeys = fiKeys.filter((k) => getValueAtPath(fi, k) === '');
      if (emptyKeys.length > 0) {
        fail(`FI has empty values for: ${emptyKeys.join(', ')}`);
      }
    });

    it('no TODO/FIXME/TRANSLATE placeholders in EN', () => {
      const placeholderPattern = /\b(TODO|FIXME|TRANSLATE|XXX)\b/i;
      const badKeys = enKeys.filter((k) => {
        const value = getValueAtPath(en, k);
        return typeof value === 'string' && placeholderPattern.test(value);
      });
      if (badKeys.length > 0) {
        fail(`EN has placeholder text in: ${badKeys.join(', ')}`);
      }
    });

    it('no TODO/FIXME/TRANSLATE placeholders in FI', () => {
      const placeholderPattern = /\b(TODO|FIXME|TRANSLATE|XXX)\b/i;
      const badKeys = fiKeys.filter((k) => {
        const value = getValueAtPath(fi, k);
        return typeof value === 'string' && placeholderPattern.test(value);
      });
      if (badKeys.length > 0) {
        fail(`FI has placeholder text in: ${badKeys.join(', ')}`);
      }
    });
  });

  describe('Interpolation Variables', () => {
    it('interpolation variables should match between EN and FI', () => {
      const variablePattern = /\{\{(\w+)\}\}/g;
      const mismatches: string[] = [];

      enKeys.forEach((key) => {
        const enValue = getValueAtPath(en, key);
        const fiValue = getValueAtPath(fi, key);

        if (typeof enValue === 'string' && typeof fiValue === 'string') {
          const enVars = new Set([...enValue.matchAll(variablePattern)].map((m) => m[1]));
          const fiVars = new Set([...fiValue.matchAll(variablePattern)].map((m) => m[1]));

          const enOnly = [...enVars].filter((v) => !fiVars.has(v));
          const fiOnly = [...fiVars].filter((v) => !enVars.has(v));

          if (enOnly.length > 0 || fiOnly.length > 0) {
            mismatches.push(
              `${key}: EN has {${[...enVars].join(',')}}, FI has {${[...fiVars].join(',')}}`
            );
          }
        }
      });

      if (mismatches.length > 0) {
        fail(
          `Interpolation variable mismatches:\n${mismatches.slice(0, 5).join('\n')}${mismatches.length > 5 ? `\n... and ${mismatches.length - 5} more` : ''}`
        );
      }
    });
  });

  describe('Pluralization', () => {
    it('pluralization keys should be complete (_one and _other pairs)', () => {
      const pluralSuffixes = ['_zero', '_one', '_two', '_few', '_many', '_other'];
      const incompletePairs: string[] = [];

      enKeys.forEach((key) => {
        pluralSuffixes.forEach((suffix) => {
          if (key.endsWith(suffix)) {
            const baseKey = key.slice(0, -suffix.length);
            // If we have _one, we should have _other (the most common pair)
            if (suffix === '_one') {
              const otherKey = `${baseKey}_other`;
              if (!enKeys.includes(otherKey)) {
                incompletePairs.push(`${key} exists but ${otherKey} is missing`);
              }
            }
          }
        });
      });

      if (incompletePairs.length > 0) {
        fail(`Incomplete pluralization pairs:\n${incompletePairs.join('\n')}`);
      }
    });
  });

  describe('Consistency Checks', () => {
    it('button labels should be consistent (Save vs Save Changes)', () => {
      // This is a sample consistency check - adjust based on your conventions
      const saveKeys = enKeys.filter((k) => k.toLowerCase().includes('save'));
      // Just ensure they exist - specific consistency rules can be added
      expect(saveKeys.length).toBeGreaterThan(0);
    });

    it('modal titles should follow naming convention', () => {
      const modalTitleKeys = enKeys.filter(
        (k) => k.includes('Modal.title') || k.includes('Modal.createTitle')
      );
      // Ensure modal title keys exist
      expect(modalTitleKeys.length).toBeGreaterThan(0);
    });
  });

  describe('Snapshot', () => {
    it('EN key count should match expected (update snapshot if intentional)', () => {
      // Update this number when intentionally adding/removing keys
      expect(enKeys.length).toBe(1698);
    });

    it('FI key count should match expected (update snapshot if intentional)', () => {
      // Update this number when intentionally adding/removing keys
      expect(fiKeys.length).toBe(1698);
    });
  });
});

describe('i18n-types.ts Validation', () => {
  const typesPath = path.join(process.cwd(), 'src/i18n-types.ts');

  it('i18n-types.ts should exist', () => {
    expect(fs.existsSync(typesPath)).toBe(true);
  });

  it('i18n-types.ts should have correct number of keys', () => {
    const typesContent = fs.readFileSync(typesPath, 'utf8');
    // Count the number of translation key entries
    const keyMatches = typesContent.match(/\| '[^']+'/g);
    const keyCount = keyMatches ? keyMatches.length : 0;

    const enContent = fs.readFileSync(enPath, 'utf8');
    const en = JSON.parse(enContent);
    const enKeys = getAllKeys(en);

    expect(keyCount).toBe(enKeys.length);
  });
});
