"use client"

import * as React from "react"

/**
 * Deadline based countdown so the timer never drifts while the tab is
 * throttled or the device sleeps.
 */
export function useCountdown(defaultSeconds: number) {
  const [secondsLeft, setSecondsLeft] = React.useState(0)
  const [isActive, setIsActive] = React.useState(false)
  const deadlineRef = React.useRef<number | null>(null)

  const start = React.useCallback(
    (seconds: number = defaultSeconds) => {
      deadlineRef.current = Date.now() + seconds * 1000
      setSecondsLeft(seconds)
      setIsActive(true)
    },
    [defaultSeconds]
  )

  const stop = React.useCallback(() => {
    deadlineRef.current = null
    setIsActive(false)
    setSecondsLeft(0)
  }, [])

  React.useEffect(() => {
    if (!isActive) return

    const tick = () => {
      const deadline = deadlineRef.current
      if (deadline === null) return

      const remaining = Math.max(
        0,
        Math.ceil((deadline - Date.now()) / 1000)
      )
      setSecondsLeft(remaining)

      if (remaining === 0) {
        deadlineRef.current = null
        setIsActive(false)
      }
    }

    tick()
    const intervalId = window.setInterval(tick, 250)

    return () => window.clearInterval(intervalId)
  }, [isActive])

  return {
    secondsLeft,
    isActive,
    isExpired: !isActive && secondsLeft === 0,
    start,
    stop,
  }
}

/** Formats a number of seconds as `m:ss`. */
export function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}
