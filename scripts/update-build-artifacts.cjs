const fs = require('fs');
const path = require('path');

// Read the updated source file
const newFactoryTs = fs.readFileSync('pxt-target/libs/core/factory.ts', 'utf8');

// Expand Machine/Belt enum slots beyond the original 8.
// Mirrors enums.d.ts: A..H + M9..M64, Belt1..Belt64.
// Strip remnants of removed custom namespaces (variables_, functions_) from
// compiled metadata so the editor stops showing duplicate categories that
// now rely on the built-in Blockly Variables/Functions categories.
const REMOVED_NAMESPACES = ['variables_', 'functions_']

function stripVariablesNs(json) {
  const colors = json && json.appTheme && json.appTheme.blockColors
  if (colors) {
    for (const ns of REMOVED_NAMESPACES) {
      if (Object.prototype.hasOwnProperty.call(colors, ns)) {
        delete colors[ns]
      }
    }
  }
  const byQ = json && json.apiInfo && json.apiInfo['libs/core'] && json.apiInfo['libs/core'].apis && json.apiInfo['libs/core'].apis.byQName
  if (byQ) {
    for (const k of Object.keys(byQ)) {
      for (const ns of REMOVED_NAMESPACES) {
        if (k === ns || k.startsWith(ns + '.')) {
          delete byQ[k]
          break
        }
      }
    }
  }
}

// Override weights for namespaces that we want placed in a specific
// order relative to PXT's built-in categories. Custom namespaces read
// their weight from byQName, so we override `events` here.
// Built-in categories (loops, logic, variables, functions) ignore
// byQName weight and instead use weights hard-coded in
// public/pxt-editor/main.js — see patchBuiltinCategoryWeights below.
//
// Desired order (highest → lowest weight):
//   Machines(100), Belts(80), Loops(70), Logic(60), Events(55),
//   Variables(50.07, built-in), Functions(50.05, built-in + patched).
function overrideNamespaceWeights(byQName) {
  if (!byQName) return;
  if (byQName['events'] && byQName['events'].attributes) {
    byQName['events'].attributes.weight = 55;
  }
}

// Patch machines.pickMachine block label: the source uses `%machine`
// (dropdown only) to avoid duplicating the word "machine" when the
// Machine enum members themselves render as "machine A", "machine 9", etc.
function patchPickMachineLabel(byQName) {
  if (!byQName) return;
  const pm = byQName['machines.pickMachine'];
  if (!pm || !pm.attributes) return;
  // Defensive: reassert block label in case a stale compiled artifact is being patched without a full pxt build.
  pm.attributes.block = '%machine';
  if (pm.attributes._def && Array.isArray(pm.attributes._def.parts)) {
    // factory.ts must set block="%machine"; this strips any residual "machine " literal label emitted by older toolchains.
    pm.attributes._def.parts = pm.attributes._def.parts.filter(
      (p) => !(p && p.kind === 'label' && typeof p.text === 'string' && /^machine\s*$/i.test(p.text))
    );
  }
}

function expandSlots(byQName) {
  if (!byQName) return;
  const tmplM = byQName['Machine.A'];
  if (tmplM) {
    for (let n = 9; n <= 64; n++) {
      const key = 'Machine.M' + n;
      if (byQName[key]) continue;
      const clone = JSON.parse(JSON.stringify(tmplM));
      clone.retType = key;
      clone.attributes.block = 'machine ' + n;
      clone.attributes._def.parts[0].text = 'machine ' + n;
      clone.extendsTypes = [key, 'Number'];
      byQName[key] = clone;
    }
  }
  const tmplB = byQName['Belt.Belt1'];
  if (tmplB) {
    for (let n = 9; n <= 64; n++) {
      const key = 'Belt.Belt' + n;
      if (byQName[key]) continue;
      const clone = JSON.parse(JSON.stringify(tmplB));
      clone.retType = key;
      clone.attributes.block = 'belt ' + n;
      clone.attributes._def.parts[0].text = 'belt ' + n;
      clone.extendsTypes = [key, 'Number'];
      byQName[key] = clone;
    }
  }
}

// Force `#cccc44` (Blockly.Msg.LOGIC_HUE) onto the logic namespace AND
// each predicate block. The compiled `byQName` is not regenerated from
// factory.ts on every build, so these colors must be patched in to keep
// our `currentItemIs*` predicates visually identical to PXT's built-in
// `controls_if` / `logic_compare` blocks.
function patchLogicColors(byQName) {
  if (!byQName) return;
  const LOGIC_COLOR = '#cccc44';
  // Place `color` at the top of attributes so its serialized position
  // stays close to the `"attributes": {` header. Downstream artifact
  // tests scan a bounded window after the header for the color key, and
  // would miss it if it landed after the large nested `_def` block.
  const hoistColor = (attrs) => {
    const { color, ...rest } = attrs;
    return { color: LOGIC_COLOR, ...rest };
  };
  if (byQName['logic'] && byQName['logic'].attributes) {
    byQName['logic'].attributes = hoistColor(byQName['logic'].attributes);
  }
  for (const qname of ['logic.currentItemIsDefective', 'logic.currentItemIs']) {
    const entry = byQName[qname];
    if (entry && entry.attributes) {
      entry.attributes = hoistColor(entry.attributes);
    }
  }
}

// Patch Events category + event blocks:
//  • Events namespace color 35 → 50 (PXT hue 50 = yellow, per convention)
//  • Remove `handlerStatement: true` from single-handler-only event blocks
//    (`onOrderReceived`, `onBeltJam`) so PXT renders them as hats with no
//    previous/next connections.
//  • `events.onMachineIdle` keeps `handlerStatement: true` because its
//    second parameter is the handler — without the directive PXT cannot
//    materialize a HANDLER statement input on a block that has a
//    preceding non-handler value input.
//  • Move `machines.onMachineIdle` into the `events` namespace so it
//    inherits the Events color and lives next to its siblings.
function patchEventBlocks(byQName) {
  if (!byQName) return;
  if (byQName['events'] && byQName['events'].attributes) {
    byQName['events'].attributes.color = '50';
  }
  const EVENT_IDS = ['events.onOrderReceived', 'events.onBeltJam'];
  for (const k of EVENT_IDS) {
    const entry = byQName[k];
    if (entry && entry.attributes && entry.attributes.handlerStatement) {
      delete entry.attributes.handlerStatement;
    }
  }
  // Move machines.onMachineIdle → events.onMachineIdle (preserving
  // `handlerStatement: true` from the source `//% handlerStatement=1`).
  const idle = byQName['machines.onMachineIdle'];
  if (idle) {
    const cloned = JSON.parse(JSON.stringify(idle));
    if (cloned.attributes) {
      cloned.attributes.weight = 80;
    }
    cloned.pyQName = 'events.on_machine_idle';
    byQName['events.onMachineIdle'] = cloned;
    delete byQName['machines.onMachineIdle'];
  }
}

// Inject `loops.wait` block metadata if missing. The script's normal
// behavior is to copy the updated factory.ts source verbatim into each
// artifact, but the compiled `apiInfo.byQName` map is NOT regenerated
// from that source — it must be patched directly. This helper mirrors
// the structural shape of `loops.repeatTimes` (a simple loops block
// with one numeric parameter and explicit min/max bounds), but omits
// `handlerStatement` because the wait blocks are leaf statements, not
// wrappers. Used by both `loops.wait` and `loops.waitTicks`.
// Idempotent: returns early if the entry already exists.
function addSimpleNumericLoopsBlock(byQName, spec) {
  if (!byQName || byQName[spec.qName]) return;
  byQName[spec.qName] = {
    kind: -3,
    attributes: {
      paramDefl: { [spec.paramName]: String(spec.defl) },
      block: `${spec.labelPrefix} %${spec.paramName} ${spec.labelSuffix}`,
      blockId: spec.blockId,
      weight: spec.weight,
      explicitDefaults: [spec.paramName],
      paramMin: { [spec.paramName]: String(spec.min) },
      paramMax: { [spec.paramName]: String(spec.max) },
      _def: {
        parts: [
          { kind: 'label', text: `${spec.labelPrefix} `, style: [] },
          { kind: 'param', name: spec.paramName, ref: false },
          { kind: 'label', text: ` ${spec.labelSuffix}`, style: [] },
        ],
        parameters: [{ kind: 'param', name: spec.paramName, ref: false }],
      },
    },
    parameters: [{
      name: spec.paramName,
      initializer: String(spec.defl),
      default: String(spec.defl),
      options: { min: { value: String(spec.min) }, max: { value: String(spec.max) } },
    }],
    pyQName: spec.pyQName,
  };
}

// Inject `machines.setMachineSpeed` block metadata if missing. Mirrors the
// shape of the post-rollout `machines.setRecipe` entry: the `machine`
// param carries no `type`/`isEnum` so PXT honors the `_shadowOverrides`
// directive and renders the slot as a value input pre-populated with the
// `factory_pick_machine` reporter shadow. Idempotent — returns early if
// already set.
function addMachineSpeedBlock(byQName) {
  if (!byQName || byQName['machines.setMachineSpeed']) return;
  byQName['machines.setMachineSpeed'] = {
    kind: -3,
    attributes: {
      paramDefl: { speed: '1' },
      block: 'set %machine speed to %speed',
      blockId: 'factory_set_machine_speed',
      _shadowOverrides: { machine: 'factory_pick_machine' },
      weight: 70,
      explicitDefaults: ['speed'],
      paramMin: { speed: '1' },
      paramMax: { speed: '10' },
      _def: {
        parts: [
          { kind: 'label', text: 'set ', style: [] },
          { kind: 'param', name: 'machine', shadowBlockId: 'factory_pick_machine', ref: false },
          { kind: 'label', text: ' speed to ', style: [] },
          { kind: 'param', name: 'speed', ref: false },
        ],
        parameters: [
          { kind: 'param', name: 'machine', shadowBlockId: 'factory_pick_machine', ref: false },
          { kind: 'param', name: 'speed', ref: false },
        ],
      },
    },
    parameters: [
      { name: 'machine' },
      {
        name: 'speed',
        initializer: '1',
        default: '1',
        options: { min: { value: '1' }, max: { value: '10' } },
      },
    ],
    pyQName: 'machines.set_machine_speed',
  };
}

// Inject the `events.onItemArrives` event hat (Level 4 unlock).
// Mirrors the shape of the post-patch `events.onMachineIdle` entry:
// `machine: number` parameter with `_shadowOverrides` so PXT renders a
// value input pre-populated with the `factory_pick_machine` reporter
// shadow, plus `handlerStatement: true` because the second parameter
// is the body handler. Idempotent.
function addOnItemArrivesEvent(byQName) {
  if (!byQName || byQName['events.onItemArrives']) return;
  byQName['events.onItemArrives'] = {
    kind: -3,
    attributes: {
      block: 'on item arrives at %machine',
      blockId: 'factory_on_item_arrives',
      _shadowOverrides: { machine: 'factory_pick_machine' },
      weight: 70,
      handlerStatement: true,
      _def: {
        parts: [
          { kind: 'label', text: 'on item arrives at ', style: [] },
          { kind: 'param', name: 'machine', shadowBlockId: 'factory_pick_machine', ref: false },
        ],
        parameters: [
          { kind: 'param', name: 'machine', shadowBlockId: 'factory_pick_machine', ref: false },
        ],
      },
    },
    parameters: [
      { name: 'machine' },
      { name: 'handler', type: '() => void', handlerParameters: [] },
    ],
    pyQName: 'events.on_item_arrives',
  };
}

// Applies all byQName patches that must run for both target.json and
// target.js artifacts. Extracted so the two emit loops do not drift.
function applyAllPatches(byQName) {
  if (!byQName) return;

  delete byQName['machines.producePart'];
  delete byQName['logic.ifQuality'];
  delete byQName['logic.ifItemType'];
  delete byQName['factory.setSplitterCondition'];

  // E4i: scrub the legacy `SplitterSide` enum + its three members. The
  // enum was deleted from enums.d.ts; this wipe also covers any entries
  // that may linger in an older built target.json checked in before the
  // cleanup.
  delete byQName['SplitterSide'];
  delete byQName['SplitterSide.Left'];
  delete byQName['SplitterSide.Forward'];
  delete byQName['SplitterSide.Right'];

  // E4g: scrub legacy splitters namespace + its three blocks. The
  // namespace was deleted from factory.ts; this wipe also covers any
  // entries that may linger from an older built target.json checked in
  // before the cleanup.
  delete byQName['splitters'];
  delete byQName['splitters.routeCurrentItemTo'];
  delete byQName['splitters.currentItemIsDefective'];
  delete byQName['splitters.currentItemIs'];
  // E4f: legacy event hat name removed; replaced by events.onItemArrives.
  delete byQName['events.onItemArrivesAtSplitter'];

  // Move recipes.setRecipe to machines.setRecipe
  if (byQName['recipes.setRecipe']) {
    const setRecipeBlock = JSON.parse(JSON.stringify(byQName['recipes.setRecipe']));
    setRecipeBlock.attributes.weight = 80;
    setRecipeBlock.pyQName = 'machines.set_recipe';
    byQName['machines.setRecipe'] = setRecipeBlock;
    delete byQName['recipes.setRecipe'];
  }

  // Remove recipes namespace entry
  delete byQName['recipes'];

  expandSlots(byQName);
  patchPickMachineLabel(byQName);
  overrideNamespaceWeights(byQName);
  patchLogicColors(byQName);
  patchEventBlocks(byQName);
  addSimpleNumericLoopsBlock(byQName, {
    qName: 'loops.wait', blockId: 'factory_wait', paramName: 'ms',
    labelPrefix: 'wait', labelSuffix: 'ms',
    defl: 1000, min: 0, max: 60000, weight: 95, pyQName: 'loops.wait',
  });
  addSimpleNumericLoopsBlock(byQName, {
    qName: 'loops.waitTicks', blockId: 'factory_wait_ticks', paramName: 'ticks',
    labelPrefix: 'wait', labelSuffix: 'ticks',
    defl: 10, min: 0, max: 600, weight: 92, pyQName: 'loops.wait_ticks',
  });
  addMachineSpeedBlock(byQName);
  addOnItemArrivesEvent(byQName);
}

// Files to update
const files = [
  'pxt-target/built/target.json',
  'public/pxt-editor/target.json',
];

for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const json = JSON.parse(content);

  // Update embedded factory.ts source in core package
  json.bundledpkgs.core['factory.ts'] = newFactoryTs;

  applyAllPatches(json.apiInfo['libs/core'].apis.byQName);
  stripVariablesNs(json);

  fs.writeFileSync(f, JSON.stringify(json, null, 4) + '\n', 'utf8');
  console.log(`Updated ${f}`);
}

// Also update .js files (they wrap JSON in `var pxtTargetBundle = ...`)
const jsFiles = [
  'pxt-target/built/target.js',
  'public/pxt-editor/target.js',
];

for (const f of jsFiles) {
  const content = fs.readFileSync(f, 'utf8');
  // Extract JSON from `var pxtTargetBundle = {...}`
  const match = content.match(/^var\s+pxtTargetBundle\s*=\s*/);
  if (!match) {
    console.log(`Skipping ${f} - unexpected format`);
    continue;
  }
  const jsonStr = content.slice(match[0].length);
  const json = JSON.parse(jsonStr);

  // Same changes as above
  json.bundledpkgs.core['factory.ts'] = newFactoryTs;

  applyAllPatches(json.apiInfo['libs/core'].apis.byQName);
  stripVariablesNs(json);

  fs.writeFileSync(f, match[0] + JSON.stringify(json, null, 4) + '\n', 'utf8');
  console.log(`Updated ${f}`);
}

// Patch the PXT built-in "Functions" toolbox category so it (a) appears
// at the top level rather than under "Advanced" and (b) renders AFTER
// Variables (built-in weight 50.07). We lower its weight to 50.05 which
// puts it below Variables, producing the order: ...Logic, Events (55),
// Variables (50.07), Functions (50.05). Idempotent.
function patchBuiltinFunctions() {
  const file = 'public/pxt-editor/main.js';
  const targetSuffix = 'callingConvention:0,icon:"functions"';
  const desired = `attributes:{advanced:!1,weight:50.05,${targetSuffix}`;
  const variants = [
    `attributes:{advanced:!0,weight:50.08,${targetSuffix}`,
    `attributes:{advanced:!1,weight:50.08,${targetSuffix}`,
    `attributes:{advanced:!0,weight:50.05,${targetSuffix}`,
  ];
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const v of variants) {
    if (content.includes(v)) {
      content = content.split(v).join(desired);
      changed = true;
    }
  }
  if (!changed) {
    console.log(`Skipped ${file} - Functions category already patched`);
    return;
  }
  fs.writeFileSync(file, content, 'utf8');
  console.log(`Updated ${file} - patched built-in Functions category`);
}

// Patch built-in Loops and Logic category weights so the toolbox renders
// them between our custom Belts (80) category and Events (55). PXT reads
// these weights from a baked-in registry in main.js rather than from
// byQName, so namespace-level `//% weight=` annotations in factory.ts
// have no effect on them. We bump:
//   Loops 50.09 → 70
//   Logic 50.08 → 60
// producing the final order: Machines (100), Belts (80), Loops (70),
// Logic (60), Events (55), Variables (50.07), Functions (50.05).
// There are two occurrences of each (Blockly + Monaco toolbox registries).
// Idempotent.
function patchBuiltinCategoryWeights() {
  const file = 'public/pxt-editor/main.js';
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  const replacements = [
    { from: 'icon:"loops",weight:50.09', to: 'icon:"loops",weight:70' },
    { from: 'weight:50.08,icon:"logic"', to: 'weight:60,icon:"logic"' },
  ];
  for (const { from, to } of replacements) {
    if (content.includes(from)) {
      content = content.split(from).join(to);
      changed = true;
    }
  }
  if (!changed) {
    console.log(`Skipped ${file} - Loops/Logic weights already patched`);
    return;
  }
  fs.writeFileSync(file, content, 'utf8');
  console.log(`Updated ${file} - patched built-in Loops/Logic weights`);
}

// Patch the bundled PXT BlocksEditor so its constructor stores the
// freshly-created instance on `window.__rfBlocksEditor`. PxtEditor
// uses that handle to (a) wrap `getNamespaceAttrs` so the Splitters
// category is hidden when the current level is < 4 and (b) trigger
// `editor.refreshToolbox()` on every level change. Idempotent.
function patchExposeBlocksEditor() {
  const file = 'public/pxt-editor/main.js';
  const anchor = 'class w extends a.ToolboxEditor{constructor(e){super(e),this.isFirstBlocklyLoad=!0';
  const desired = 'class w extends a.ToolboxEditor{constructor(e){super(e),"undefined"!=typeof window&&(window.__rfBlocksEditor=this),this.isFirstBlocklyLoad=!0';
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes(desired)) {
    console.log(`Skipped ${file} - BlocksEditor exposure already patched`);
    return;
  }
  if (!content.includes(anchor)) {
    console.warn(`WARNING: ${file} - BlocksEditor anchor not found; skipping window exposure patch`);
    return;
  }
  content = content.replace(anchor, desired);
  fs.writeFileSync(file, content, 'utf8');
  console.log(`Updated ${file} - exposed BlocksEditor on window.__rfBlocksEditor`);
}

patchBuiltinFunctions();
patchBuiltinCategoryWeights();
patchExposeBlocksEditor();

// Write Czech locale file to the PXT editor locale directory.
// This file is gitignored (in public/pxt-editor/) so it must be
// regenerated during each build. The source is the committed file at
// pxt-target/libs/core/_locales/cs/core-strings.json.
// If the PXT staticpkg step already generated a cs/strings.json, we
// merge our custom translations on top (ours win on any key conflict).
function writeCsLocaleFile() {
  const destPath = 'public/pxt-editor/locales/cs/strings.json';
  const srcPath = 'pxt-target/libs/core/_locales/cs/core-strings.json';

  // Ensure destination directory exists
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Load committed Czech translations
  const csStrings = JSON.parse(fs.readFileSync(srcPath, 'utf8'));

  // Load any existing file from pxt staticpkg (optional base)
  let existing = {};
  if (fs.existsSync(destPath)) {
    try { existing = JSON.parse(fs.readFileSync(destPath, 'utf8')); } catch { /* ignore */ }
  }

  // Our translations win over PXT defaults
  const merged = { ...existing, ...csStrings };
  fs.writeFileSync(destPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${destPath} (${Object.keys(merged).length} keys)`);
}

writeCsLocaleFile();
