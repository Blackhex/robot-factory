import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * RED tests for the proof-of-concept slice that converts the
 * `factory_set_recipe` consumer block's `machine` parameter from an
 * inline `Blockly.FieldDropdown` (PXT renders this for any enum-typed
 * parameter) into a Machine-typed value input that accepts the
 * existing `factory_pick_machine` reporter (or a Blockly variable
 * holding a Machine value).
 *
 * Why these tests fail today:
 *
 * The previous attempt monkey-patched the rendered Blockly block at
 * runtime to swap the FieldDropdown for a value input WITHOUT
 * changing the underlying PXT API parameter type. PXT's blocks→TS
 * compiler refused any non-literal expression for an enum-typed
 * parameter — it silently dropped the reporter and emitted
 * `undefined`. We reverted that work.
 *
 * The new approach (executed by the GREEN agent) is structurally
 * different: change the underlying PXT API parameter type from
 * `Machine` to `number` in `pxt-target/libs/core/factory.ts`. PXT
 * then natively renders the parameter as a value input at PXT-build
 * time (because `number` is not enum-typed, so the
 * `_shadowOverrides`/`shadowBlockId` directive PXT already emits
 * is honoured). Blockly typing keeps non-Machine reporters out of
 * the slot via `setCheck('Machine')` on the value input.
 *
 * SCOPE: this PoC slice covers ONE consumer block
 * (`factory_set_recipe`) and ONE reporter (`factory_pick_machine`).
 * The other 5 consumer blocks (`factory_start_machine`,
 * `factory_stop_machine`, `factory_set_machine_speed`,
 * `factory_on_machine_idle`, `factory_set_belt_speed`) STAY on
 * inline FieldDropdown. We validate the approach end-to-end on one
 * block first; the corresponding guards in `FactoryShadowInputs.test.ts`
 * for the unchanged blocks must remain in force.
 */

const FACTORY_TS_PATH = resolve(
  __dirname,
  '../../../pxt-target/libs/core/factory.ts',
)
const TARGET_JSON_PATH = resolve(
  __dirname,
  '../../../public/pxt-editor/target.json',
)

function readFactorySource(): string {
  return readFileSync(FACTORY_TS_PATH, 'utf8')
}

/**
 * Return the contiguous `//%` annotation block surrounding the line
 * that declares `blockId=<blockId>`. Includes adjacent `//%` lines
 * both above and below the matched line.
 */
function extractAnnotation(source: string, blockId: string): string {
  const lines = source.split('\n')
  let lineIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`blockId=${blockId}`)) {
      lineIdx = i
      break
    }
  }
  expect(lineIdx, `${blockId} declaration must exist in factory.ts`).toBeGreaterThan(-1)

  let start = lineIdx
  while (start > 0 && lines[start - 1].trim().startsWith('//%')) start--
  let end = lineIdx
  while (end < lines.length - 1 && lines[end + 1].trim().startsWith('//%')) end++
  return lines.slice(start, end + 1).join('\n')
}

/**
 * Return the source between `namespace <ns> {` and the matching
 * closing brace `}` anchored at the start of a line (column 0).
 */
function extractNamespaceBody(source: string, namespaceName: string): string {
  const re = new RegExp(`namespace\\s+${namespaceName}\\s*\\{[\\s\\S]*?^\\}`, 'm')
  const match = source.match(re)
  expect(match, `namespace ${namespaceName} must exist in factory.ts`).not.toBeNull()
  return match![0]
}

/**
 * Return the function-declaration line for `<name>` inside
 * `namespace <ns>`. Walks until the closing `)` of the parameter
 * list to capture multi-line signatures as a single string with all
 * whitespace collapsed.
 */
function extractFunctionSignature(
  source: string,
  namespaceName: string,
  functionName: string,
): string {
  const body = extractNamespaceBody(source, namespaceName)
  const re = new RegExp(`export\\s+function\\s+${functionName}\\s*\\(([^)]*)\\)([^{]*)`)
  const m = body.match(re)
  expect(
    m,
    `function ${namespaceName}.${functionName} must exist in factory.ts`,
  ).not.toBeNull()
  return `export function ${functionName}(${m![1]})${m![2]}`.replace(/\s+/g, ' ')
}

describe('factory.ts — factory_set_recipe machine slot becomes Machine-typed value input (PoC)', () => {
  it('setRecipe is declared inside namespace machines', () => {
    // GIVEN
    const body = extractNamespaceBody(readFactorySource(), 'machines')

    // THEN
    expect(body).toMatch(/blockId=factory_set_recipe/)
    expect(body).toMatch(/export\s+function\s+setRecipe\s*\(/)
  })

  it('setRecipe machine parameter is NOT typed `Machine` (the enum that triggers the inline-FieldDropdown render path)', () => {
    // GIVEN — the GREEN refactor changes the param type so PXT no
    // longer renders it as an inline FieldDropdown. The exact
    // spelling may vary (`number`, a branded alias, …); the only
    // invariant we care about is that PXT does not see the param
    // as enum-typed.
    const sig = extractFunctionSignature(readFactorySource(), 'machines', 'setRecipe')

    // THEN — the literal token `: Machine` (followed by `,` for the
    // first parameter, optionally with whitespace) must NOT appear.
    expect(
      sig,
      'setRecipe still declares `machine: Machine`. PXT renders enum-' +
        'typed parameters as inline `Blockly.FieldDropdown` regardless of ' +
        'any `//% machine.shadow=...` directive. The PoC requires changing ' +
        'this parameter type so PXT renders a value input instead.',
    ).not.toMatch(/machine\s*:\s*Machine\b/)
  })

  it('setRecipe declares a //% machine.shadow="factory_pick_machine" directive so PXT pre-populates the value input with a default reporter', () => {
    // GIVEN
    const annotation = extractAnnotation(readFactorySource(), 'factory_set_recipe')

    // THEN — with the param no longer enum-typed, PXT honours the
    // shadow directive and the toolbox flyout shape carries a
    // `factory_pick_machine` SHADOW pre-populated in the slot.
    // (See target.json `_shadowOverrides.machine` and the per-param
    // `shadowBlockId` in `_def.parts` / `_def.parameters`.)
    expect(
      annotation,
      'factory_set_recipe is missing `//% machine.shadow="factory_pick_machine"`. ' +
        'Without it the toolbox flyout would expose an empty socket and the ' +
        'pickMachine reporter would have no default placement.',
    ).toMatch(/machine\.shadow\s*=\s*"factory_pick_machine"/)
  })

  it('setRecipe recipe parameter remains typed `Recipe` (unchanged by this PoC)', () => {
    // GIVEN
    const sig = extractFunctionSignature(readFactorySource(), 'machines', 'setRecipe')

    // THEN — the recipe slot is OUT OF SCOPE for this PoC. It must
    // still be enum-typed so PXT keeps the inline recipe dropdown.
    expect(sig).toMatch(/recipe\s*:\s*Recipe\b/)
  })

  it('factory_pick_machine reporter is unchanged: takes a Machine and returns a Machine', () => {
    // GIVEN
    const sig = extractFunctionSignature(readFactorySource(), 'machines', 'pickMachine')

    // THEN — the reporter is the producer that fills the value input
    // and must still surface a typed Machine value.
    expect(sig).toMatch(/machine\s*:\s*Machine\b/)
    expect(sig).toMatch(/\)\s*:\s*Machine\b/)
  })
})

describe('factory.ts — the OTHER 5 consumer blocks have been rolled out to the same pluggable shape (post-PoC)', () => {
  // The PoC-era guards "must remain on inline FieldDropdown" are
  // intentionally inverted: the LegacyPluggableMigrationRollout
  // task brought the same `number`-typed slot + `*.shadow="…"`
  // directive to all 5 sibling blocks. Each guard now pins the
  // post-rollout contract per block; the exhaustive coverage lives
  // in `LegacyPluggableMigrationRollout.test.ts`.

  const ROLLED_OUT_MACHINE_BLOCKS: Array<{ ns: string; fn: string; blockId: string }> = [
    { ns: 'machines', fn: 'startMachine',     blockId: 'factory_start_machine' },
    { ns: 'machines', fn: 'stopMachine',      blockId: 'factory_stop_machine' },
    { ns: 'machines', fn: 'setMachineSpeed',  blockId: 'factory_set_machine_speed' },
    { ns: 'events',   fn: 'onMachineIdle',    blockId: 'factory_on_machine_idle' },
  ]

  for (const { ns, fn, blockId } of ROLLED_OUT_MACHINE_BLOCKS) {
    it(`${blockId} declares machine: number AND carries the machine.shadow="factory_pick_machine" directive`, () => {
      // GIVEN
      const source = readFactorySource()

      // THEN — param type is `number` so PXT honors the shadow
      // directive (the PXT enum-shadow compiler bug only fires for
      // enum-typed parameters).
      const sig = extractFunctionSignature(source, ns, fn)
      expect(
        sig,
        `${blockId} (${ns}.${fn}) param type must be \`number\` so PXT renders ` +
          `the slot as a value input pre-populated with the factory_pick_machine ` +
          `reporter shadow.`,
      ).toMatch(/machine\s*:\s*number\b/)

      // THEN — the shadow directive is required so PXT generates the
      // `_shadowOverrides` entry on the API metadata.
      const annotation = extractAnnotation(source, blockId)
      expect(annotation).toMatch(/machine\.shadow\s*=\s*"factory_pick_machine"/)
    })
  }

  it('factory_set_belt_speed declares belt: number AND carries the belt.shadow="factory_pick_belt" directive', () => {
    // GIVEN
    const source = readFactorySource()

    // THEN — same post-rollout contract, applied to the Belt-typed
    // sibling.
    const sig = extractFunctionSignature(source, 'belts', 'setBeltSpeed')
    expect(sig).toMatch(/belt\s*:\s*number\b/)

    const annotation = extractAnnotation(source, 'factory_set_belt_speed')
    expect(annotation).toMatch(/belt\.shadow\s*=\s*"factory_pick_belt"/)
  })
})

describe('public/pxt-editor/target.json — rebuilt artifact reflects the PoC API change', () => {
  // NOTE: this artifact is generated by the PXT build step
  // (`pxt-target` → `public/pxt-editor/target.json`). The GREEN
  // agent must rebuild after editing factory.ts. Until rebuilt,
  // these assertions fail because the artifact still carries the
  // pre-PoC enum-typed parameter metadata.

  let target: any | undefined
  try {
    if (existsSync(TARGET_JSON_PATH)) {
      target = JSON.parse(readFileSync(TARGET_JSON_PATH, 'utf8'))
    }
  } catch {
    target = undefined
  }

  function findApiEntry(qname: string): any | undefined {
    if (!target) return undefined
    // The PXT target.json embeds the API surface inside
    // `apiInfo[<package>].apis.byQName[<qname>]` (current PXT) or
    // `bundledpkgs[<package>].apis.byQName[<qname>]` (older
    // layout). Walk both so the test survives PXT version drift.
    const apiInfo = target?.apiInfo ?? {}
    for (const pkg of Object.values<any>(apiInfo)) {
      const byQ = pkg?.apis?.byQName
      if (byQ && qname in byQ) return byQ[qname]
    }
    const bundled = target?.bundledpkgs ?? {}
    for (const pkg of Object.values<any>(bundled)) {
      const byQ = pkg?.apis?.byQName
      if (byQ && qname in byQ) return byQ[qname]
    }
    const top = target?.apis?.byQName
    if (top && qname in top) return top[qname]
    return undefined
  }

  it('target.json exists (PXT artifact has been built at least once)', () => {
    expect(
      existsSync(TARGET_JSON_PATH),
      'public/pxt-editor/target.json is missing — run the PXT build step ' +
        'so the editor has metadata to load.',
    ).toBe(true)
  })

  it('machines.setRecipe.parameters[0] is NOT marked isEnum (would force inline FieldDropdown)', () => {
    // GIVEN
    const entry = findApiEntry('machines.setRecipe')
    expect(entry, 'machines.setRecipe entry not found in target.json').toBeDefined()

    const machineParam = entry.parameters?.[0]
    expect(machineParam, 'machines.setRecipe has no first parameter').toBeDefined()

    // THEN — `isEnum: true` is the flag PXT's block builder uses to
    // pick the inline FieldDropdown branch over the value input
    // branch. It must be falsy for the value-input render path to
    // engage.
    expect(
      machineParam.isEnum,
      'machines.setRecipe first parameter is still marked `isEnum: true`. ' +
        'Rebuild the PXT target after changing the parameter type in ' +
        'pxt-target/libs/core/factory.ts.',
    ).not.toBe(true)
  })

  it('machines.setRecipe.parameters[0].type is NOT "Machine" (the enum name)', () => {
    // GIVEN
    const entry = findApiEntry('machines.setRecipe')
    expect(entry).toBeDefined()
    const machineParam = entry.parameters?.[0]
    expect(machineParam).toBeDefined()

    // THEN
    expect(machineParam.type).not.toBe('Machine')
  })

  it('machines.setRecipe attributes still carry the _shadowOverrides.machine="factory_pick_machine" directive', () => {
    // GIVEN
    const entry = findApiEntry('machines.setRecipe')
    expect(entry).toBeDefined()

    // THEN — this drives the toolbox-flyout pre-population of the
    // value input with a `factory_pick_machine` shadow. It is
    // already present in the current artifact (PXT emits it from
    // the source directive) and must REMAIN present.
    const overrides = entry.attributes?._shadowOverrides
    expect(overrides?.machine).toBe('factory_pick_machine')
  })

  it('machines.pickMachine still has retType "Machine" (lets the reporter plug into Machine-checked value inputs)', () => {
    // GIVEN
    const entry = findApiEntry('machines.pickMachine')
    expect(entry, 'machines.pickMachine entry not found in target.json').toBeDefined()

    // THEN
    expect(entry.retType).toBe('Machine')
  })
})
