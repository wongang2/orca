import { detectAgentSendTitleStatus } from '@/lib/agent-send-title-status'
import { resolveRuntimePaneTitleLeafResolution } from '@/lib/runtime-pane-title-leaf-id'
import type { AgentStatusEntry, AgentStatusState } from '../../../../shared/agent-status-types'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import type { TerminalLayoutSnapshot, TerminalTab } from '../../../../shared/types'

type StaleAgentRowStateArgs = {
  entry: AgentStatusEntry
  tab: TerminalTab
  runtimePaneTitlesByTabId?: Record<string, Record<number, string>>
  ptyIdsByTabId?: Record<string, string[]>
  terminalLayoutsByTabId?: Record<string, TerminalLayoutSnapshot | undefined>
}

export function resolveStaleAgentRowState({
  entry,
  tab,
  runtimePaneTitlesByTabId,
  ptyIdsByTabId,
  terminalLayoutsByTabId
}: StaleAgentRowStateArgs): AgentStatusState | 'idle' {
  if (entry.state !== 'working') {
    return entry.state === 'done' ? 'done' : 'idle'
  }
  const parsed = parsePaneKey(entry.paneKey)
  if (!parsed) {
    return 'idle'
  }
  const layout = terminalLayoutsByTabId?.[tab.id]
  const livePtyIds = ptyIdsByTabId?.[tab.id] ?? []
  const layoutPtyId = layout?.ptyIdsByLeafId?.[parsed.leafId]
  const hasLivePty = layoutPtyId
    ? livePtyIds.includes(layoutPtyId)
    : livePtyIds.length === 1 && (!layout?.root || layout.root.type === 'leaf')
  if (!hasLivePty) {
    return 'idle'
  }
  const titleResolution = resolveRuntimePaneTitleLeafResolution(
    layout,
    runtimePaneTitlesByTabId?.[tab.id],
    parsed.leafId
  )
  const title = titleResolution.title ?? (titleResolution.hasAnyPaneTitle ? null : tab.title)
  return detectAgentSendTitleStatus(title) === 'working' ? 'working' : 'idle'
}
