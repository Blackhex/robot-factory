import i18next from 'i18next'
import {
  buildDropdownOptions,
  patchFieldDropdownClassValidation,
  resolveDropdownText,
} from './dropdownOptions'
import { autoResetEnumFieldsForWorkspace } from './slotEnumAutoReset'
import { buildRecipeDropdownEntries, resolveRecipeOptionsForBlock } from './recipeDropdownFilter'
import { installRecipeAutoResetListener } from './recipeAutoReset'

const MACHINE_BLOCK_TYPES = [
  'factory_start_machine',
  'factory_stop_machine',
  'factory_set_recipe',
  'factory_on_machine_idle',
  'factory_pick_machine',
  'factory_set_machine_speed',
  'factory_on_item_arrives',
  'factory_route_items_to',
] as const

const BELT_BLOCK_TYPES = [
  'factory_set_belt_speed',
  'factory_pick_belt',
  'factory_on_belt_jam',
] as const

const RECIPE_BLOCK_TYPES = ['factory_set_recipe'] as const

const MACHINE_MEMBERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
  'M9', 'M10', 'M11', 'M12', 'M13', 'M14', 'M15', 'M16',
  'M17', 'M18', 'M19', 'M20', 'M21', 'M22', 'M23', 'M24',
  'M25', 'M26', 'M27', 'M28', 'M29', 'M30', 'M31', 'M32',
  'M33', 'M34', 'M35', 'M36', 'M37', 'M38', 'M39', 'M40',
  'M41', 'M42', 'M43', 'M44', 'M45', 'M46', 'M47', 'M48',
  'M49', 'M50', 'M51', 'M52', 'M53', 'M54', 'M55', 'M56',
  'M57', 'M58', 'M59', 'M60', 'M61', 'M62', 'M63', 'M64',
] as const

const BELT_MEMBERS = [
  'Belt1', 'Belt2', 'Belt3', 'Belt4', 'Belt5', 'Belt6', 'Belt7', 'Belt8',
  'Belt9', 'Belt10', 'Belt11', 'Belt12', 'Belt13', 'Belt14', 'Belt15', 'Belt16',
  'Belt17', 'Belt18', 'Belt19', 'Belt20', 'Belt21', 'Belt22', 'Belt23', 'Belt24',
  'Belt25', 'Belt26', 'Belt27', 'Belt28', 'Belt29', 'Belt30', 'Belt31', 'Belt32',
  'Belt33', 'Belt34', 'Belt35', 'Belt36', 'Belt37', 'Belt38', 'Belt39', 'Belt40',
  'Belt41', 'Belt42', 'Belt43', 'Belt44', 'Belt45', 'Belt46', 'Belt47', 'Belt48',
  'Belt49', 'Belt50', 'Belt51', 'Belt52', 'Belt53', 'Belt54', 'Belt55', 'Belt56',
  'Belt57', 'Belt58', 'Belt59', 'Belt60', 'Belt61', 'Belt62', 'Belt63', 'Belt64',
] as const

export const MAX_SLOTS = MACHINE_MEMBERS.length

type DropdownKind = 'machine' | 'belt'

export interface DropdownPatchState {
  prototypePatched: boolean
  textPatched: boolean
  recipeAutoResetInstalled: boolean
}

function forceRerender(field: any): void {
  try { field.forceRerender?.() } catch { /* no-op */ }
  try { field.getSourceBlock?.()?.render?.() } catch { /* no-op */ }
}

function buildLabelMap(kind: DropdownKind, items: Array<{ slotIndex: number; id: string; name?: string; label?: string }>): Record<string, string> {
  const members = kind === 'machine' ? MACHINE_MEMBERS : BELT_MEMBERS
  const prefix = kind === 'machine' ? 'Machine' : 'Belt'
  const map: Record<string, string> = {}
  for (const item of items) {
    if (item.slotIndex < 0 || item.slotIndex >= members.length) continue
    const value = `${prefix}.${members[item.slotIndex]}`
    map[value] = item.name ?? item.label ?? item.id
  }
  return map
}

function patchGetOptions(blockly: any, iframeWindow: any): void {
  if (blockly.FieldDropdown.prototype.__rfDynamicOptionsPatched) return
  const origGetOptions = blockly.FieldDropdown.prototype.getOptions
  blockly.FieldDropdown.prototype.getOptions = function(this: any, useCache?: boolean) {
    const block = this.sourceBlock_
    const fieldName = this.name as string | undefined
    if (block && fieldName === 'machine' && MACHINE_BLOCK_TYPES.includes(block.type)) {
      const options = buildDropdownOptions(
        'machine',
        iframeWindow.__rf_machineItems || [],
        iframeWindow.__rf_machineMembers || MACHINE_MEMBERS,
        iframeWindow.__rf_machineEmptyLabel ?? i18next.t('blocks.no_machines'),
      )
      return options
    }
    if (block && fieldName === 'belt' && BELT_BLOCK_TYPES.includes(block.type)) {
      const options = buildDropdownOptions(
        'belt',
        iframeWindow.__rf_beltItems || [],
        iframeWindow.__rf_beltMembers || BELT_MEMBERS,
        iframeWindow.__rf_beltEmptyLabel ?? i18next.t('blocks.no_belts'),
      )
      return options
    }
    if (block && fieldName === 'recipe' && RECIPE_BLOCK_TYPES.includes(block.type)) {
      const original = typeof origGetOptions === 'function' ? (origGetOptions.call(this, useCache) as [string, string][]) : []
      return resolveRecipeOptionsForBlock(block, iframeWindow, original)
    }
    return typeof origGetOptions === 'function' ? origGetOptions.call(this, useCache) : []
  }
  blockly.FieldDropdown.prototype.__rfDynamicOptionsPatched = true
}

function patchBlockToString(blockly: any, iframeWindow: any): void {
  if (!blockly.Block?.prototype) return
  if (blockly.Block.prototype.__rfReporterToStringPatched) return
  const origToString = blockly.Block.prototype.toString
  blockly.Block.prototype.toString = function(this: any) {
    if (this.type === 'factory_pick_machine') {
      const field = this.getField?.('machine')
      const value = typeof field?.getValue === 'function' ? field.getValue() : null
      if (typeof value === 'string') {
        const rendered = resolveDropdownText(
          value,
          iframeWindow.__rf_machineLabels || {},
          iframeWindow.__rf_machineEmptyLabel ?? '',
        )
        if (rendered !== null) return rendered
      }
    }
    if (this.type === 'factory_pick_belt') {
      const field = this.getField?.('belt')
      const value = typeof field?.getValue === 'function' ? field.getValue() : null
      if (typeof value === 'string') {
        const rendered = resolveDropdownText(
          value,
          iframeWindow.__rf_beltLabels || {},
          iframeWindow.__rf_beltEmptyLabel ?? '',
        )
        if (rendered !== null) return rendered
      }
    }
    return typeof origToString === 'function' ? origToString.call(this) : ''
  }
  blockly.Block.prototype.__rfReporterToStringPatched = true
}

function patchGetText(blockly: any, iframeWindow: any): void {
  if (blockly.FieldDropdown.prototype.__rfDynamicTextPatched) return
  const origGetText = blockly.FieldDropdown.prototype.getText
  blockly.FieldDropdown.prototype.getText = function(this: any) {
    const block = this.sourceBlock_
    const fieldName = this.name as string | undefined
    const value = this.getValue?.()
    if (typeof value === 'string' && block && fieldName === 'machine' && MACHINE_BLOCK_TYPES.includes(block.type)) {
      const text = resolveDropdownText(
        value,
        iframeWindow.__rf_machineLabels || {},
        iframeWindow.__rf_machineEmptyLabel ?? '',
      )
      if (text !== null) return text
    }
    if (typeof value === 'string' && block && fieldName === 'belt' && BELT_BLOCK_TYPES.includes(block.type)) {
      const text = resolveDropdownText(
        value,
        iframeWindow.__rf_beltLabels || {},
        iframeWindow.__rf_beltEmptyLabel ?? '',
      )
      if (text !== null) return text
    }
    return typeof origGetText === 'function' ? origGetText.call(this) : String(value ?? '')
  }
  blockly.FieldDropdown.prototype.__rfDynamicTextPatched = true
}

export function patchBlocklyDropdowns(
  iframe: HTMLIFrameElement | null,
  pxtReady: boolean,
  kind: DropdownKind,
  items: Array<{ slotIndex: number; id: string; name?: string; label?: string; type?: string }>,
  state: DropdownPatchState,
): void {
  if (!iframe || !pxtReady) return
  const win = iframe.contentWindow as any
  const Blockly = win?.Blockly
  const workspace = Blockly?.getMainWorkspace?.()
  if (!Blockly || !workspace) return

  win.__rf_machineMembers = MACHINE_MEMBERS
  win.__rf_beltMembers = BELT_MEMBERS
  win.__rf_machineEmptyLabel = i18next.t('blocks.no_machines')
  win.__rf_beltEmptyLabel = i18next.t('blocks.no_belts')
  win.__rf_recipeEntries = win.__rf_recipeEntries ?? buildRecipeDropdownEntries()

  if (kind === 'machine') {
    win.__rf_machineItems = items
    win.__rf_machineLabels = buildLabelMap('machine', items)
  } else {
    win.__rf_beltItems = items
    win.__rf_beltLabels = buildLabelMap('belt', items)
  }

  if (!state.prototypePatched) {
    patchFieldDropdownClassValidation(
      Blockly,
      win,
      MACHINE_BLOCK_TYPES,
      BELT_BLOCK_TYPES,
      RECIPE_BLOCK_TYPES,
    )
    patchGetOptions(Blockly, win)
    state.prototypePatched = true
  }

  if (!state.textPatched) {
    patchBlockToString(Blockly, win)
    patchGetText(Blockly, win)
    state.textPatched = true
  }

  if (!state.recipeAutoResetInstalled) {
    installRecipeAutoResetListener(Blockly, workspace, win)
    state.recipeAutoResetInstalled = true
  }

  autoResetEnumFieldsForWorkspace(
    workspace,
    kind,
    kind === 'machine' ? MACHINE_BLOCK_TYPES : BELT_BLOCK_TYPES,
    items,
    kind === 'machine' ? MACHINE_MEMBERS : BELT_MEMBERS,
    forceRerender,
  )

  // Refresh the open flyout so it reflects the updated machine/belt list
  // without requiring the user to close and re-open the category.
  const flyoutWorkspace = workspace.getFlyout?.()?.getWorkspace?.()
  if (flyoutWorkspace) {
    const flyoutBlockTypes = kind === 'machine' ? MACHINE_BLOCK_TYPES : BELT_BLOCK_TYPES
    autoResetEnumFieldsForWorkspace(
      flyoutWorkspace,
      kind,
      flyoutBlockTypes,
      items,
      kind === 'machine' ? MACHINE_MEMBERS : BELT_MEMBERS,
      forceRerender,
    )
    // Force-rerender ALL matching fields in the flyout so getText() re-runs
    // against the updated label map (value may be unchanged but label changed).
    const allFlyoutBlocks: any[] = flyoutWorkspace.getAllBlocks?.(false) ?? []
    for (const block of allFlyoutBlocks) {
      if (!(flyoutBlockTypes as ReadonlyArray<string>).includes(block.type)) continue
      const field = block.getField?.(kind)
      if (field) forceRerender(field)
    }
  }
}
