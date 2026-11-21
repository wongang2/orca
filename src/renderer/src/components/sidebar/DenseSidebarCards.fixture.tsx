import React from 'react'
import { useAppStore } from '@/store'
import { defineFixture } from '../../component-fixtures/component-fixture'
import type { Worktree } from '../../../../shared/worktree/types'
import WorktreeCard from './workspace-card/surface/WorktreeCard'
import * as agentExpansion from './workspace-card/activity/worktree-card-agents-expansion-state'
import {
  FIXTURE_REPO,
  makeWorktree,
  seedWorkspaces,
  type WorkspaceSeed
} from './worktree-card-slot-fixture-seeds'

// Same workspaces with the dense sidebar off and on: two hosts with a same-named main, agents, long Korean names.
const SEEDS: (WorkspaceSeed & { host: string; main?: boolean })[] = [
  {
    id: 'wt-server-main',
    name: 'main',
    host: '빌드 서버',
    main: true,
    agents: [
      { agentType: 'claude', state: 'done', minutesAgo: 9, message: '릴리스 노트 초안 정리' },
      { agentType: 'codex', state: 'working', minutesAgo: 1, toolName: 'Edit' }
    ]
  },
  {
    id: 'wt-local-main',
    name: 'main',
    host: '로컬 Mac',
    main: true,
    agents: [],
    lastActivityMinutesAgo: 85 * 24 * 60
  },
  {
    id: 'wt-launch',
    name: '신제품-발표-행사-운영-준비-긴-이름이-잘리는지-확인하는-작업공간',
    host: '빌드 서버',
    agents: [],
    lastActivityMinutesAgo: 14 * 60
  },
  {
    id: 'wt-review',
    name: '연구소-발표자료-검토',
    host: '빌드 서버',
    agents: [{ agentType: 'claude', state: 'blocked', minutesAgo: 2, prompt: '승인 필요' }]
  },
  {
    id: 'wt-local-docs',
    name: '문서-사이트-업그레이드',
    host: '로컬 Mac',
    agents: [],
    lastActivityMinutesAgo: 14 * 60
  }
]

const now = Date.now()
const WORKTREES = new Map<string, Worktree>(
  SEEDS.map((seed) => {
    const worktree = makeWorktree(seed, now)
    return [seed.id, seed.main ? { ...worktree, isMainWorktree: true, branch: 'main' } : worktree]
  })
)

function seed(dense: boolean, newStyle = false): void {
  seedWorkspaces(SEEDS, now)
  agentExpansion.clearWorktreeAgentExpansionStateForTests()
  useAppStore.setState((state) => ({
    worktreesByRepo: { ...state.worktreesByRepo, [FIXTURE_REPO.id]: [...WORKTREES.values()] },
    worktreeCardProperties: [
      'status',
      'unread',
      'issue',
      'linear-issue',
      'pr',
      'automation',
      'comment',
      'ports',
      'inline-agents',
      'host'
    ],
    agentActivityDisplayMode: 'compact',
    settings: state.settings
      ? { ...state.settings, experimentalNewWorktreeCardStyle: newStyle, denseSidebar: dense }
      : state.settings
  }))
}

function Cards(): React.JSX.Element {
  return (
    <div className="flex flex-col bg-worktree-sidebar py-1.5 text-worktree-sidebar-foreground">
      {SEEDS.map((entry, index) => (
        <div key={entry.id} className="relative" data-worktree-id={entry.id}>
          <WorktreeCard
            worktree={WORKTREES.get(entry.id)!}
            repo={FIXTURE_REPO}
            isActive={index === 0}
            contentIndent={20}
            flushSurface
            nativeDragEnabled={false}
            hostContextLabel={entry.host}
            hideRepoBadge
          />
        </div>
      ))}
    </div>
  )
}

export const defaultLayout = defineFixture({
  width: 300,
  setup: () => seed(false),
  render: () => <Cards />
})

export const dense = defineFixture({ width: 300, setup: () => seed(true), render: () => <Cards /> })

export const denseNarrow = defineFixture({
  width: 220,
  setup: () => seed(true),
  render: () => <Cards />
})

/** The experimental card style, which the live app may use, with the dense sidebar off and on. */
export const newStyleDefault = defineFixture({
  width: 300,
  setup: () => seed(false, true),
  render: () => <Cards />
})

export const newStyleDense = defineFixture({
  width: 300,
  setup: () => seed(true, true),
  render: () => <Cards />
})
