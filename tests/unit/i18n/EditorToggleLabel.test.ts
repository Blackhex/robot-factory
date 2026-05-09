import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import i18next from 'i18next';

function loadLocale(name: string): Record<string, unknown> {
  const path = resolve(__dirname, '../../../src/locales', `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('editor-toggle toolbar button label', () => {
  const en = loadLocale('en') as { actions: Record<string, string> };
  const cs = loadLocale('cs') as { actions: Record<string, string> };

  it('en.json actions.open_editor equals "Code"', () => {
    expect(en.actions.open_editor).toBe('Code');
  });

  it('cs.json actions.open_editor equals "Kód"', () => {
    expect(cs.actions.open_editor).toBe('Kód');
  });

  describe('via i18next runtime lookup', () => {
    beforeAll(async () => {
      await i18next.init({
        lng: 'en',
        fallbackLng: 'en',
        resources: {
          en: { translation: en },
          cs: { translation: cs },
        },
      });
    });

    it('returns "Code" when language is en', async () => {
      await i18next.changeLanguage('en');
      expect(i18next.t('actions.open_editor')).toBe('Code');
    });

    it('returns "Kód" when language is cs', async () => {
      await i18next.changeLanguage('cs');
      expect(i18next.t('actions.open_editor')).toBe('Kód');
    });
  });
});
