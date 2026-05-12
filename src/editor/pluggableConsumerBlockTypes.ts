/**
 * Single source of truth for the 6 block-type IDs that participate in the
 * pluggable Machine/Belt slot rollout. Consumed by PxtEditor's
 * decompile-clobber watchdog detection and by guard tests. Belt-side and
 * machine-side consumers are listed together because the watchdog cares
 * about all 6 equally.
 */
export const PLUGGABLE_CONSUMER_BLOCK_TYPES: readonly string[] = Object.freeze([
  'factory_set_recipe',
  'factory_start_machine',
  'factory_stop_machine',
  'factory_set_machine_speed',
  'factory_on_machine_idle',
  'factory_set_belt_speed',
] as const)
