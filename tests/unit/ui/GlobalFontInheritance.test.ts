import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(
  resolve(__dirname, '../../../src/style.css'),
  'utf8',
);
const cssCollapsed = css.replace(/\s+/g, ' ');

const SELECTOR = 'button, input, select, textarea';

function findRuleBodyAfter(selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`);
  const m = cssCollapsed.match(re);
  return m ? m[1] : null;
}

function findRuleBody(selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}(?![\\w:.\\-])\\s*\\{([^}]*)\\}`);
  const m = css.match(re);
  return m ? m[1] : null;
}

describe('Global form-control font inheritance', () => {
  it('declares a single rule for button, input, select, textarea', () => {
    const occurrences = cssCollapsed.split(SELECTOR).length - 1;
    expect(
      occurrences,
      `expected exactly one occurrence of "${SELECTOR}" in src/style.css`,
    ).toBe(1);
  });

  it('the rule body declares font-family: inherit', () => {
    const body = findRuleBodyAfter(SELECTOR);
    expect(
      body,
      `rule for "${SELECTOR}" must exist in src/style.css`,
    ).not.toBeNull();
    expect(body!).toMatch(/font-family\s*:\s*inherit\s*;?/);
  });

  it('.ui-projects-slot-delete does not need its own font-family declaration', () => {
    const body = findRuleBody('.ui-projects-slot-delete');
    expect(
      body,
      '.ui-projects-slot-delete rule must exist in src/style.css',
    ).not.toBeNull();
    expect(
      body!,
      '.ui-projects-slot-delete should rely on the global font-family: inherit rule',
    ).not.toMatch(/(?<![\w-])font-family\s*:/);
  });
});

describe('Global form-control font-weight (semibold)', () => {
  it('the global rule body declares font-weight: 600', () => {
    const body = findRuleBodyAfter(SELECTOR);
    expect(
      body,
      `rule for "${SELECTOR}" must exist in src/style.css`,
    ).not.toBeNull();
    expect(body!).toMatch(/font-weight\s*:\s*600\s*;?/);
  });

  it('.ui-toolbar-btn does not declare font-weight: 500', () => {
    const body = findRuleBody('.ui-toolbar-btn');
    expect(
      body,
      '.ui-toolbar-btn rule must exist in src/style.css',
    ).not.toBeNull();
    expect(body!).not.toMatch(/font-weight\s*:\s*500\s*;?/);
  });

  it('.ui-projects-slot-save does not declare font-weight: 500', () => {
    const body = findRuleBody('.ui-projects-slot-save');
    expect(
      body,
      '.ui-projects-slot-save rule must exist in src/style.css',
    ).not.toBeNull();
    expect(body!).not.toMatch(/font-weight\s*:\s*500\s*;?/);
  });

  it('.ui-modal-btn does not declare font-weight: 500', () => {
    const body = findRuleBody('.ui-modal-btn');
    expect(
      body,
      '.ui-modal-btn rule must exist in src/style.css',
    ).not.toBeNull();
    expect(body!).not.toMatch(/font-weight\s*:\s*500\s*;?/);
  });
});
