import React from 'react'
import { useAppStore } from '@/store'
import { selectDenseSidebar } from '@/store/appearance/sidebar-density'
import { useTranslate } from '@/i18n/use-translate'
import { SettingsSwitchRow } from '../form-controls/SettingsFormControls'

/** Dense sidebar switch beside the card layout; off restores Orca's default spacing. */
export function DenseSidebarSetting(): React.JSX.Element {
  const t = useTranslate()
  const dense = useAppStore(selectDenseSidebar)
  const updateSettings = useAppStore((s) => s.updateSettings)
  return (
    <SettingsSwitchRow
      label={t('sidebar.density.dense', 'Dense sidebar')}
      description={t(
        'sidebar.density.denseDescription',
        'Tighter rows, with host and indicators on the name line. Turn off for the default layout.'
      )}
      checked={dense}
      onChange={() => void updateSettings({ denseSidebar: !dense })}
    />
  )
}
