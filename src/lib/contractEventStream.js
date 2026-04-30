function withJitter(ms, ratio = 0.15) {
  const span = Math.max(0, ms * ratio)
  const delta = (Math.random() * 2 - 1) * span
  return Math.max(0, Math.round(ms + delta))
}

export function startContractEventStream({
  fetchEvents,
  getCursor,
  setCursor,
  onEvents,
  onError,
  minIntervalMs = 1500,
  maxIntervalMs = 20000,
  hiddenIntervalMs = 45000,
} = {}) {
  if (typeof fetchEvents !== 'function') {
    throw new Error('startContractEventStream requires fetchEvents')
  }

  let stopped = false
  let timer = null
  let inflight = false
  let currentInterval = minIntervalMs

  function clearTimer() {
    if (timer != null) {
      window.clearTimeout(timer)
      timer = null
    }
  }

  function schedule(nextMs) {
    if (stopped) {
      return
    }

    clearTimer()
    timer = window.setTimeout(tick, withJitter(nextMs))
  }

  function computeNextInterval({ hadEvents, failed }) {
    if (failed) {
      return Math.min(maxIntervalMs, Math.max(minIntervalMs, Math.round(currentInterval * 2)))
    }

    if (hadEvents) {
      return minIntervalMs
    }

    return Math.min(maxIntervalMs, Math.max(minIntervalMs, Math.round(currentInterval * 1.35)))
  }

  async function tick() {
    if (stopped || inflight) {
      return
    }

    if (typeof document !== 'undefined' && document.hidden) {
      schedule(hiddenIntervalMs)
      return
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      currentInterval = computeNextInterval({ hadEvents: false, failed: true })
      schedule(currentInterval)
      return
    }

    inflight = true

    try {
      const batch = await fetchEvents(getCursor?.())
      if (stopped) {
        return
      }

      if (batch?.cursor) {
        setCursor?.(batch.cursor)
      }

      const events = Array.isArray(batch?.events) ? batch.events : []
      if (events.length) {
        await onEvents?.(events, batch)
      }

      currentInterval = computeNextInterval({ hadEvents: events.length > 0, failed: false })
    } catch (error) {
      currentInterval = computeNextInterval({ hadEvents: false, failed: true })
      onError?.(error)
    } finally {
      inflight = false
      schedule(currentInterval)
    }
  }

  function handleVisibility() {
    if (!document.hidden) {
      schedule(0)
    }
  }

  function handleOnline() {
    schedule(0)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)
  }

  schedule(0)

  return {
    poke() {
      schedule(0)
    },
    stop() {
      stopped = true
      clearTimer()
      if (typeof window !== 'undefined') {
        window.removeEventListener('visibilitychange', handleVisibility)
        window.removeEventListener('online', handleOnline)
      }
    },
  }
}

