/**
 * learning-core — the scenario-agnostic learning core shared by the
 * Extension and the Desktop client. Environment-neutral by design: no
 * chrome.*, no DOM, no React. Contract owners: docs/v2/.
 */
export * from './types'
export * from './normalize'
export * from './validate'
export * from './factory'
export * from './scheduler'
export * from './query'
export * from './review'
export * from './wire'
export * from './zip'
export * from './markdown-export'
export * from './sync'
export { FragmentStore, type FragmentSaveOutcome, type FragmentPatch } from './fragment-store'
