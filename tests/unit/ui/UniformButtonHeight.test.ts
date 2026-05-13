import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(
  resolve(__dirname, '../../../src/style.css'),
  'utf8',
);

function findRuleBody(selector: string): string | null {
  // Walk the stylesheet rule-by-rule and return the body of the first rule
  // whose selector list contains an entry equal to `selector` — i.e. the
  // exact base rule, not a descendant/modifier/pseudo selector that begins
  // with the same prefix (e.g. `.foo > .target` must NOT match `.target`,
  // and `.target--variant` must NOT match `.target`).
  const ruleRe = /([^{}]*)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(css)) !== null) {
    const selectorList = m[1];
    const body = m[2];
    // Strip CSS comments inside the selector list, then split on top-level
    // commas. (Selectors used in this file's tests don't contain commas in
    // functional-pseudo arguments, so a plain split is sufficient here.)
    const cleaned = selectorList.replace(/\/\*[\s\S]*?\*\//g, '');
    const entries = cleaned.split(',').map((s) => s.trim());
    if (entries.includes(selector)) {
      return body;
    }
  }
  return null;
}

const HEIGHT_TOKEN_RE = /(?<![\w-])height\s*:\s*var\(\s*--rf-btn-h\s*\)\s*;?/;

describe('Uniform interactive button height (--rf-btn-h)', () => {
  it(':root defines --rf-btn-h: 2.5rem', () => {
    const rootMatch = css.match(/:root\s*\{([^}]*)\}/);
    expect(rootMatch, ':root rule must exist in src/style.css').not.toBeNull();
    const body = rootMatch![1];
    expect(body).toMatch(/--rf-btn-h\s*:\s*2\.5rem\s*;?/);
  });

  const selectors = [
    '.ui-toolbar-btn',
    '.ui-projects-slot-save',
    '.ui-projects-btn--import',
    '.ui-projects-btn--export',
    '.ui-projects-slot-delete',
    '.ui-modal-cancel',
    '.ui-modal-confirm',
  ] as const;

  for (const selector of selectors) {
    it(`${selector} declares height: var(--rf-btn-h)`, () => {
      const body = findRuleBody(selector);
      expect(
        body,
        `${selector} rule must exist as a base rule in src/style.css`,
      ).not.toBeNull();
      expect(
        body!,
        `${selector} must declare height: var(--rf-btn-h)`,
      ).toMatch(HEIGHT_TOKEN_RE);
    });
  }
});

// Accept either the shorthand `border: 1px solid var(--rf-accent)` declaration
// OR the equivalent split into `border-width: 1px;`, `border-style: solid;`,
// and `border-color: var(--rf-accent);`. Whitespace tolerant.
function hasAccentBorder(body: string): boolean {
  const shorthand =
    /border\s*:\s*1px\s+solid\s+var\(\s*--rf-accent\s*\)\s*;?/.test(body);
  if (shorthand) return true;
  const width = /border-width\s*:\s*1px\s*;?/.test(body);
  const style = /border-style\s*:\s*solid\s*;?/.test(body);
  const color = /border-color\s*:\s*var\(\s*--rf-accent\s*\)\s*;?/.test(body);
  return width && style && color;
}

const TRANSPARENT_BG_RE = /background\s*:\s*transparent\s*;?/;
const ACCENT_COLOR_RE = /color\s*:\s*var\(\s*--rf-accent\s*\)\s*;?/;

describe('Toolbar padding + accent style + lang align', () => {
  it('--rf-toolbar-h is calc(3.5rem + 1px)', () => {
    const rootMatch = css.match(/:root\s*\{([^}]*)\}/);
    expect(rootMatch, ':root rule must exist in src/style.css').not.toBeNull();
    const body = rootMatch![1];
    expect(body).toMatch(
      /--rf-toolbar-h\s*:\s*calc\(\s*3\.5rem\s*\+\s*1px\s*\)\s*;?/,
    );
  });

  const accentSelectors = [
    '.ui-toolbar-btn--back-to-menu',
    '.ui-toolbar-btn--reset-view',
    '.ui-lang-btn',
  ] as const;

  for (const selector of accentSelectors) {
    it(`${selector} rule body declares background: transparent`, () => {
      const body = findRuleBody(selector);
      expect(
        body,
        `${selector} rule must exist as a base rule in src/style.css`,
      ).not.toBeNull();
      expect(body!).toMatch(TRANSPARENT_BG_RE);
    });

    it(`${selector} rule body declares color: var(--rf-accent)`, () => {
      const body = findRuleBody(selector);
      expect(body).not.toBeNull();
      expect(body!).toMatch(ACCENT_COLOR_RE);
    });

    it(`${selector} rule body declares 1px solid var(--rf-accent) border`, () => {
      const body = findRuleBody(selector);
      expect(body).not.toBeNull();
      expect(
        hasAccentBorder(body!),
        `${selector} must declare border: 1px solid var(--rf-accent) ` +
          `(or equivalent border-width/border-style/border-color split)`,
      ).toBe(true);
    });
  }

  it('.ui-lang-btn-container rule body declares top: 0.5rem', () => {
    const body = findRuleBody('.ui-lang-btn-container');
    expect(body, '.ui-lang-btn-container rule must exist').not.toBeNull();
    expect(body!).toMatch(/top\s*:\s*0\.5rem\s*;?/);
  });

  it('.ui-lang-btn-container rule body does NOT declare transform: translateY(-50%)', () => {
    const body = findRuleBody('.ui-lang-btn-container');
    expect(body).not.toBeNull();
    expect(body!).not.toMatch(
      /transform\s*:\s*translateY\(\s*-50%\s*\)\s*;?/,
    );
  });
});

describe('Main menu button — toolbar-style accent', () => {
  it('.ui-main-menu-btn rule body declares background: transparent', () => {
    const body = findRuleBody('.ui-main-menu-btn');
    expect(
      body,
      '.ui-main-menu-btn rule must exist as a base rule in src/style.css',
    ).not.toBeNull();
    expect(body!).toMatch(TRANSPARENT_BG_RE);
  });

  it('.ui-main-menu-btn rule body declares color: var(--rf-accent)', () => {
    const body = findRuleBody('.ui-main-menu-btn');
    expect(body).not.toBeNull();
    expect(body!).toMatch(ACCENT_COLOR_RE);
  });

  it('.ui-main-menu-btn rule body declares 1px solid var(--rf-accent) border', () => {
    const body = findRuleBody('.ui-main-menu-btn');
    expect(body).not.toBeNull();
    expect(
      hasAccentBorder(body!),
      '.ui-main-menu-btn must declare border: 1px solid var(--rf-accent) ' +
        '(or equivalent border-width/border-style/border-color split)',
    ).toBe(true);
  });

  it('.ui-main-menu-btn rule body declares font-size: 0.875rem', () => {
    const body = findRuleBody('.ui-main-menu-btn');
    expect(body).not.toBeNull();
    expect(body!).toMatch(/font-size\s*:\s*0\.875rem\s*;?/);
  });

  it('.ui-main-menu-btn rule body keeps height + min-height: var(--rf-btn-h)', () => {
    const body = findRuleBody('.ui-main-menu-btn');
    expect(body).not.toBeNull();
    expect(body!).toMatch(HEIGHT_TOKEN_RE);
    expect(body!).toMatch(/min-height\s*:\s*var\(\s*--rf-btn-h\s*\)\s*;?/);
  });

  it('.ui-main-menu-btn:hover rule body declares background: var(--rf-accent-glow)', () => {
    const body = findRuleBody('.ui-main-menu-btn:hover');
    expect(
      body,
      '.ui-main-menu-btn:hover rule must exist in src/style.css',
    ).not.toBeNull();
    expect(body!).toMatch(
      /background\s*:\s*var\(\s*--rf-accent-glow\s*\)\s*;?/,
    );
  });

  it('.ui-main-menu-btn--primary rule body keeps background: var(--rf-accent)', () => {
    const body = findRuleBody('.ui-main-menu-btn--primary');
    expect(
      body,
      '.ui-main-menu-btn--primary rule must exist in src/style.css',
    ).not.toBeNull();
    expect(body!).toMatch(/background\s*:\s*var\(\s*--rf-accent\s*\)\s*;?/);
  });
});

describe('Project slot — toolbar-style spacing around delete button', () => {
  it('.ui-projects-slot declares padding: 0.5rem (matches toolbar)', () => {
    const body = findRuleBody('.ui-projects-slot');
    expect(body, '.ui-projects-slot rule must exist').not.toBeNull();
    expect(body!).toMatch(/padding\s*:\s*0\.5rem\s*;?/);
  });

  it('.ui-projects-slot declares gap: 0.5rem (matches toolbar)', () => {
    const body = findRuleBody('.ui-projects-slot');
    expect(body, '.ui-projects-slot rule must exist').not.toBeNull();
    expect(body!).toMatch(/gap\s*:\s*0\.5rem\s*;?/);
  });

  it('.ui-projects-slot does NOT keep the old padding: 0 0.75rem declaration', () => {
    const body = findRuleBody('.ui-projects-slot');
    expect(body, '.ui-projects-slot rule must exist').not.toBeNull();
    expect(body!).not.toMatch(/padding\s*:\s*0\s+0\.75rem\s*;?/);
  });

  it('.ui-projects-slot declares min-height: var(--rf-btn-h)', () => {
    const body = findRuleBody('.ui-projects-slot');
    expect(body, '.ui-projects-slot rule must exist').not.toBeNull();
    expect(body!).toMatch(/min-height\s*:\s*var\(\s*--rf-btn-h\s*\)\s*;?/);
  });

  it('.ui-projects-slot does NOT declare a fixed height: var(--rf-btn-h)', () => {
    const body = findRuleBody('.ui-projects-slot');
    expect(body, '.ui-projects-slot rule must exist').not.toBeNull();
    expect(body!).not.toMatch(HEIGHT_TOKEN_RE);
  });
});

describe('Project slot Save button — typography matches toolbar accent buttons', () => {
  it('.ui-projects-slot-save declares font-family: var(--rf-font)', () => {
    const body = findRuleBody('.ui-projects-slot-save');
    expect(body, '.ui-projects-slot-save rule must exist').not.toBeNull();
    expect(body!).toMatch(/font-family\s*:\s*var\(\s*--rf-font\s*\)\s*;?/);
  });

  it('.ui-projects-slot-save declares font-size: 0.875rem', () => {
    const body = findRuleBody('.ui-projects-slot-save');
    expect(body, '.ui-projects-slot-save rule must exist').not.toBeNull();
    expect(body!).toMatch(/font-size\s*:\s*0\.875rem\s*;?/);
  });

  it('.ui-projects-slot-save does not declare font-weight: 500 (inherits semibold default)', () => {
    const body = findRuleBody('.ui-projects-slot-save');
    expect(body, '.ui-projects-slot-save rule must exist').not.toBeNull();
    expect(body!).not.toMatch(/font-weight\s*:\s*500\s*;?/);
  });
});

describe('Empty row dimming — scoped to placeholder label', () => {
  it('.ui-projects-slot--empty rule body does NOT declare opacity', () => {
    const body = findRuleBody('.ui-projects-slot--empty');
    expect(
      body,
      '.ui-projects-slot--empty rule must exist',
    ).not.toBeNull();
    expect(body!).not.toMatch(/opacity\s*:/);
  });

  it('.ui-projects-slot--empty rule body does NOT declare font-style: italic', () => {
    const body = findRuleBody('.ui-projects-slot--empty');
    expect(
      body,
      '.ui-projects-slot--empty rule must exist',
    ).not.toBeNull();
    expect(body!).not.toMatch(/font-style\s*:\s*italic/);
  });

  it('.ui-projects-slot--empty .ui-projects-slot-name declares opacity: 0.75', () => {
    const body = findRuleBody(
      '.ui-projects-slot--empty .ui-projects-slot-name',
    );
    expect(
      body,
      '.ui-projects-slot--empty .ui-projects-slot-name rule must exist',
    ).not.toBeNull();
    expect(body!).toMatch(/opacity\s*:\s*0\.75\s*;?/);
  });

  it('.ui-projects-slot--empty .ui-projects-slot-name declares font-style: italic', () => {
    const body = findRuleBody(
      '.ui-projects-slot--empty .ui-projects-slot-name',
    );
    expect(
      body,
      '.ui-projects-slot--empty .ui-projects-slot-name rule must exist',
    ).not.toBeNull();
    expect(body!).toMatch(/font-style\s*:\s*italic\s*;?/);
  });
});

describe('Import/Export buttons — match Menu accent style', () => {
  it('.ui-projects-btn rule body declares background: transparent', () => {
    const body = findRuleBody('.ui-projects-btn');
    expect(
      body,
      '.ui-projects-btn rule must exist as a base rule in src/style.css',
    ).not.toBeNull();
    expect(body!).toMatch(TRANSPARENT_BG_RE);
  });

  it('.ui-projects-btn rule body declares color: var(--rf-accent)', () => {
    const body = findRuleBody('.ui-projects-btn');
    expect(body).not.toBeNull();
    expect(body!).toMatch(ACCENT_COLOR_RE);
  });

  it('.ui-projects-btn rule body declares 1px solid var(--rf-accent) border', () => {
    const body = findRuleBody('.ui-projects-btn');
    expect(body).not.toBeNull();
    expect(
      hasAccentBorder(body!),
      '.ui-projects-btn must declare border: 1px solid var(--rf-accent) ' +
        '(or equivalent border-width/border-style/border-color split)',
    ).toBe(true);
  });

  it('.ui-projects-btn rule body declares font-family: var(--rf-font)', () => {
    const body = findRuleBody('.ui-projects-btn');
    expect(body).not.toBeNull();
    expect(body!).toMatch(/font-family\s*:\s*var\(\s*--rf-font\s*\)\s*;?/);
  });

  it('.ui-projects-btn rule body declares font-weight: 600', () => {
    const body = findRuleBody('.ui-projects-btn');
    expect(body).not.toBeNull();
    expect(body!).toMatch(/font-weight\s*:\s*600\s*;?/);
  });

  it('.ui-projects-btn rule body does NOT declare background: var(--rf-surface) (regression)', () => {
    const body = findRuleBody('.ui-projects-btn');
    expect(body).not.toBeNull();
    expect(body!).not.toMatch(
      /background\s*:\s*var\(\s*--rf-surface\s*\)\s*;?/,
    );
  });

  it('.ui-projects-btn rule body does NOT declare color: var(--rf-text) (regression)', () => {
    const body = findRuleBody('.ui-projects-btn');
    expect(body).not.toBeNull();
    expect(body!).not.toMatch(/color\s*:\s*var\(\s*--rf-text\s*\)\s*;?/);
  });

  it('.ui-projects-btn rule body does NOT declare border: 1px solid var(--rf-border) (regression)', () => {
    const body = findRuleBody('.ui-projects-btn');
    expect(body).not.toBeNull();
    expect(body!).not.toMatch(
      /border\s*:\s*1px\s+solid\s+var\(\s*--rf-border\s*\)\s*;?/,
    );
  });

  it('.ui-projects-btn:hover rule body declares background: var(--rf-accent-glow)', () => {
    const body = findRuleBody('.ui-projects-btn:hover');
    expect(
      body,
      '.ui-projects-btn:hover rule must exist in src/style.css',
    ).not.toBeNull();
    expect(body!).toMatch(
      /background\s*:\s*var\(\s*--rf-accent-glow\s*\)\s*;?/,
    );
  });
});