import i18next from 'i18next'

function humanizeIdentifier(value: string): string {
  return value
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getLocalizedMachineName(machineType?: string): string {
  if (machineType && i18next.exists(`machines.${machineType}`)) {
    return i18next.t(`machines.${machineType}`)
  }

  return i18next.t('game_over.machine_fallback')
}

export function getLocalizedItemName(itemType: string): string {
  if (i18next.exists(`items.${itemType}`)) {
    return i18next.t(`items.${itemType}`)
  }

  if (i18next.exists(`parts.${itemType}`)) {
    return i18next.t(`parts.${itemType}`)
  }

  return i18next.t('game_over.item_fallback', {
    item: humanizeIdentifier(itemType),
  })
}