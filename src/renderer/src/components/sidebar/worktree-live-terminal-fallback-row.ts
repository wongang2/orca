import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import { formatAgentTypeLabel } from '@/lib/agent-status'
import type {
  AgentStatusEntry,
  AgentStatusOrchestrationContext
} from '../../../../shared/agent-status-types'
import { isTerminalLeafId, makePaneKey } from '../../../../shared/stable-pane-id'
import type { TerminalTab } from '../../../../shared/types'

export function addLiveTerminalFallbackRow(args: {
  rows: DashboardAgentRow[]
  seenPaneKeys: Set<string>
  tab: TerminalTab
  leafId: string | null | undefined
  now: number
  includeUnidentifiedTerminalTabs?: boolean
  runtimeAgentOrchestrationByPaneKey?: Record<string, AgentStatusOrchestrationContext>
}): void {
  if (
    (!args.tab.launchAgent && !args.includeUnidentifiedTerminalTabs) ||
    !args.leafId ||
    !isTerminalLeafId(args.leafId)
  ) {
    return
  }
  const paneKey = makePaneKey(args.tab.id, args.leafId)
  if (args.seenPaneKeys.has(paneKey)) {
    return
  }
  const agentType = args.tab.launchAgent ?? 'unknown'
  const orchestration = args.runtimeAgentOrchestrationByPaneKey?.[paneKey]
  const fallbackLabel =
    args.tab.customTitle?.trim() ||
    args.tab.quickCommandLabel?.trim() ||
    args.tab.generatedTitle?.trim() ||
    args.tab.title?.trim() ||
    args.tab.defaultTitle?.trim() ||
    'Terminal'
  const entry: AgentStatusEntry = {
    paneKey,
    state: 'working',
    prompt: args.tab.launchAgent ? formatAgentTypeLabel(agentType) : fallbackLabel,
    updatedAt: args.now,
    stateStartedAt: args.tab.createdAt,
    stateHistory: [],
    agentType,
    terminalTitle: args.tab.title,
    lastAssistantMessage: args.tab.launchAgent ? 'Idle' : 'Terminal',
    ...(orchestration ? { orchestration } : {})
  }
  args.rows.push({
    paneKey,
    entry,
    tab: args.tab,
    agentType,
    rowSource: 'live',
    state: 'idle',
    startedAt: args.tab.createdAt
  })
  args.seenPaneKeys.add(paneKey)
}
