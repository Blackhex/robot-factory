const fs = require('fs');
const path = require('path');

// Read the updated source file
const newFactoryTs = fs.readFileSync('pxt-target/libs/core/factory.ts', 'utf8');

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
  }

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
  }

  fs.writeFileSync(f, match[0] + JSON.stringify(json, null, 4) + '\n', 'utf8');
  console.log(`Updated ${f}`);
}
