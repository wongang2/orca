import type { AppState } from '../types'

/** Dense sidebar: tighter rows across bots, project headers and workspace cards. Off keeps Orca's default layout. */
export function selectDenseSidebar(state: Pick<AppState, 'settings'>): boolean {
  return state.settings?.denseSidebar === true
}
