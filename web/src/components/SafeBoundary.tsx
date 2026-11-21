import { Component, type ReactNode } from 'react'

/** Keeps the storefront alive if a 3D scene or optional module fails (no WebGL, old GPU, blocked asset). */
export default class SafeBoundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) { console.warn('[veloura] optional module failed, showing fallback', e) }
  render() { return this.state.failed ? this.props.fallback ?? null : this.props.children }
}
