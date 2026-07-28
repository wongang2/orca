import { extname } from 'node:path'
import type { NativeChatTurnLifecycle } from '../../shared/native-chat-types'
import {
  subscribeNativeChatTranscript,
  type NativeChatTranscriptSubscription
} from '../native-chat/transcript-watch'

type CodexTranscriptCompletion = {
  paneKey: string
  sessionId: string
  transcriptPath: string
  turnId?: string
  startedAt: number
  onCompleted: (paneKey: string) => void
}

type PendingWatch = {
  token: object
  subscription: NativeChatTranscriptSubscription | null
  completion: CodexTranscriptCompletion
}

export class CodexTranscriptCompletionTracker {
  private watches = new Map<string, PendingWatch>()

  arm(completion: CodexTranscriptCompletion): void {
    this.drop(completion.paneKey)
    if (extname(completion.transcriptPath) !== '.jsonl') {
      return
    }

    const token = {}
    const pending: PendingWatch = { token, subscription: null, completion }
    this.watches.set(completion.paneKey, pending)
    const observeLifecycle = (lifecycle?: NativeChatTurnLifecycle): void => {
      if (
        lifecycle?.state !== 'completed' ||
        (completion.turnId
          ? lifecycle.turnId !== completion.turnId
          : lifecycle.timestamp === null || lifecycle.timestamp < completion.startedAt) ||
        this.watches.get(pending.completion.paneKey)?.token !== token
      ) {
        return
      }
      const paneKey = pending.completion.paneKey
      this.drop(paneKey)
      completion.onCompleted(paneKey)
    }

    void subscribeNativeChatTranscript({
      agent: 'codex',
      sessionId: completion.sessionId,
      filePath: completion.transcriptPath,
      initialLimit: 40,
      onInitialSnapshot: (_messages, _hasMore, _beforeOffset, _error, lifecycle) =>
        observeLifecycle(lifecycle),
      onAppend: (_messages, lifecycle) => observeLifecycle(lifecycle),
      onReplace: (_messages, _hasMore, _beforeOffset, lifecycle) => observeLifecycle(lifecycle)
    })
      .then((subscription) => {
        if (this.watches.get(pending.completion.paneKey)?.token !== token) {
          subscription.unsubscribe()
          return
        }
        pending.subscription = subscription
      })
      .catch(() => {
        if (this.watches.get(pending.completion.paneKey)?.token === token) {
          this.watches.delete(pending.completion.paneKey)
        }
      })
  }

  transfer(fromPaneKey: string, toPaneKey: string): void {
    if (fromPaneKey === toPaneKey) {
      return
    }
    const pending = this.watches.get(fromPaneKey)
    if (!pending) {
      return
    }
    this.drop(toPaneKey)
    this.watches.delete(fromPaneKey)
    pending.completion.paneKey = toPaneKey
    this.watches.set(toPaneKey, pending)
  }

  drop(paneKey: string): void {
    const pending = this.watches.get(paneKey)
    if (!pending) {
      return
    }
    this.watches.delete(paneKey)
    pending.subscription?.unsubscribe()
  }

  clear(): void {
    for (const paneKey of this.watches.keys()) {
      this.drop(paneKey)
    }
  }

  get size(): number {
    return this.watches.size
  }
}
