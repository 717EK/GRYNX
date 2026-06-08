// Lightweight navigation singleton so chrome (top-bar bell, etc.) can navigate
// without threading callbacks through every page. App registers its setter.
import type { Screen } from '../App'

let _go: ((s: Screen) => void) | null = null

export function registerNav(fn: (s: Screen) => void) {
  _go = fn
}
export function navTo(s: Screen) {
  _go?.(s)
}
