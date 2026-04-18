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

// Patch Events category + event blocks:
//  • Events namespace color 35 → 50 (PXT hue 50 = yellow, per convention)
//  • Remove `handlerStatement: true` from event-registration blocks so
//    PXT renders them as hat blocks (no previous/next connections)
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
  // Move machines.onMachineIdle → events.onMachineIdle.
  const idle = byQName['machines.onMachineIdle'];
  if (idle) {
    const cloned = JSON.parse(JSON.stringify(idle));
    if (cloned.attributes) {
      delete cloned.attributes.handlerStatement;
      cloned.attributes.weight = 80;
    }
    cloned.pyQName = 'events.on_machine_idle';
    byQName['events.onMachineIdle'] = cloned;
    delete byQName['machines.onMachineIdle'];
  } else if (byQName['events.onMachineIdle'] && byQName['events.onMachineIdle'].attributes) {
    delete byQName['events.onMachineIdle'].attributes.handlerStatement;
  }
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

  // Remove machines.producePart from compiled block metadata
  const byQName = json.apiInfo['libs/core'].apis.byQName;
  if (byQName) {
    delete byQName['machines.producePart'];

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
    patchEventBlocks(byQName);
  }

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

  const byQName2 = json.apiInfo['libs/core'].apis.byQName;
  if (byQName2) {
    delete byQName2['machines.producePart'];

    if (byQName2['recipes.setRecipe']) {
      const setRecipeBlock = JSON.parse(JSON.stringify(byQName2['recipes.setRecipe']));
      setRecipeBlock.attributes.weight = 80;
      setRecipeBlock.pyQName = 'machines.set_recipe';
      byQName2['machines.setRecipe'] = setRecipeBlock;
      delete byQName2['recipes.setRecipe'];
    }

    delete byQName2['recipes'];

    expandSlots(byQName2);
    patchPickMachineLabel(byQName2);
    overrideNamespaceWeights(byQName2);
    patchEventBlocks(byQName2);
  }

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

patchBuiltinFunctions();
patchBuiltinCategoryWeights();
