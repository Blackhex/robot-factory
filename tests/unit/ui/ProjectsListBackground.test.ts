import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('.ui-projects-list background', () => {
  it('uses var(--rf-bg) to match the PXT block editor canvas color', () => {
    const css = readFileSync(
      resolve(__dirname, '../../../src/style.css'),
      'utf8',
    );

    const ruleMatch = css.match(/\.ui-projects-list\s*\{([^}]*)\}/);
    expect(ruleMatch, '.ui-projects-list rule must exist').not.toBeNull();

    const body = ruleMatch![1];
    expect(body).toMatch(
      /background(?:-color)?\s*:\s*var\(\s*--rf-bg\s*\)\s*;?/,
    );
  });
});
