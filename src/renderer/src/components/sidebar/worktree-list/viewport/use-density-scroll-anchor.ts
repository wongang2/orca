import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { selectDenseSidebar } from '@/store/appearance/sidebar-density'
import type { Virtualizer } from '@tanstack/react-virtual'
import { getVirtualRowKey } from './virtual-rows'

// Rows remeasure over a few frames after a density switch; follow them until they settle.
const SETTLE_FRAMES = 6

type DensityAnchor = { key: string; top: number }

// The first row below the pinned header, read from the DOM the person is looking at.
function captureTopRow(scrollElement: HTMLElement | null): DensityAnchor | null {
  if (!scrollElement || scrollElement.scrollTop <= 0) {
    return null
  }
  const viewportTop = scrollElement.getBoundingClientRect().top
  const pinned = scrollElement.querySelector('[data-worktree-sticky-header-active]')
  const coveredTo = pinned ? pinned.getBoundingClientRect().bottom : viewportTop
  let best: DensityAnchor | null = null
  for (const row of scrollElement.querySelectorAll('[data-worktree-virtual-row]')) {
    if (row.hasAttribute('data-worktree-sticky-header-active')) {
      continue
    }
    const box = row.getBoundingClientRect()
    const key = getVirtualRowKey(row)
    if (key && box.bottom > coveredTo + 1 && (best === null || box.top - viewportTop < best.top)) {
      best = { key, top: box.top - viewportTop }
    }
  }
  return best
}

/** Keep the row at the top of the list in place when the sidebar density resizes every row at once. */
export function useDensityScrollAnchor(
  virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>,
  dense: boolean
): void {
  const previousDense = useRef(dense)
  const pending = useRef<DensityAnchor | null>(null)
  // Store listeners run on the write, before React commits: the DOM still shows the old density.
  useEffect(
    () =>
      useAppStore.subscribe((state, previous) => {
        if (selectDenseSidebar(state) !== selectDenseSidebar(previous)) {
          pending.current = captureTopRow(virtualizer.scrollElement)
        }
      }),
    [virtualizer]
  )
  useLayoutEffect(() => {
    if (previousDense.current === dense) {
      return undefined
    }
    previousDense.current = dense
    const anchor = pending.current
    pending.current = null
    if (!anchor) {
      return undefined
    }
    let frame = 0
    let handle = 0
    const follow = (): void => {
      const item = virtualizer.measurementsCache.find((entry) => entry.key === anchor.key)
      if (item) {
        const target = Math.max(0, item.start - anchor.top)
        if (Math.abs((virtualizer.scrollOffset ?? 0) - target) > 1) {
          virtualizer.scrollToOffset(target)
        }
      }
      frame += 1
      if (frame < SETTLE_FRAMES) {
        handle = requestAnimationFrame(follow)
      }
    }
    handle = requestAnimationFrame(follow)
    return () => cancelAnimationFrame(handle)
  }, [dense, virtualizer])
}
