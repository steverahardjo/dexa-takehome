"use client"

import * as React from "react"

import { DesktopNotice } from "@/components/desktop-notice"

/**
 * Below this width the dashboard columns stop fitting. Matches Tailwind's `lg`,
 * where the employee cards and the tables switch to their desktop layout.
 */
const NARROW = "(max-width: 1023px)"

function subscribe(onChange: () => void) {
  const query = window.matchMedia(NARROW)

  query.addEventListener("change", onChange)

  return () => query.removeEventListener("change", onChange)
}

const isNarrow = () => window.matchMedia(NARROW).matches

/**
 * Renders `children` on a laptop-sized screen and the notice otherwise, for the
 * cases the user agent check in `proxy.ts` cannot see: a resized browser window,
 * a tablet in landscape, a desktop user agent on a small device.
 */
export function DesktopOnly({ children }: { children: React.ReactNode }) {
  const narrow = React.useSyncExternalStore(subscribe, isNarrow, () => false)

  return narrow ? <DesktopNotice /> : <>{children}</>
}
