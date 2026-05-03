import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadLocale(name: string): Record<string, unknown> {
  const path = resolve(__dirname, '../../../src/locales', `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

describe('locales: Czech translations differ from English', () => {
  const en = loadLocale('en') as { toolbar: Record<string, string> };
  const cs = loadLocale('cs') as { toolbar: Record<string, string> };

  it('every toolbar key has a Czech translation distinct from the English value', () => {
    expect(en.toolbar, 'en.toolbar must be an object').toBeTypeOf('object');
    expect(cs.toolbar, 'cs.toolbar must be an object').toBeTypeOf('object');

    const untranslated: Array<{ key: string; en: string; cs: string }> = [];
    for (const key of Object.keys(en.toolbar)) {
      const enValue = en.toolbar[key];
      const csValue = cs.toolbar[key];
      expect(typeof enValue, `en.toolbar.${key} must be a string`).toBe('string');
      expect(typeof csValue, `cs.toolbar.${key} must be a string`).toBe('string');
      if (normalize(enValue) === normalize(csValue)) {
        untranslated.push({ key, en: enValue, cs: csValue });
      }
    }

    expect(
      untranslated,
      `Czech toolbar values must differ from English. Untranslated keys: ${JSON.stringify(
        untranslated,
      )}`,
    ).toEqual([]);
  });
});
