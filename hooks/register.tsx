import type { EngineInterface, Register } from 'claude-code'

import { linkify, parseGitHubRepo } from './linkify'

// Replies are drawn again on every scroll and resize, so the result for a
// text is kept; the oldest entries go once there are this many.
const CACHE_SIZE = 500

let repoFor: { cwd: string; repo: string | null } | undefined
const cache = new Map<string, string>()

// The repository #123 points into: the session's, read again when the
// working directory moves (into another worktree or repository).
async function currentRepo($: EngineInterface): Promise<string | null> {
  const cwd = await $.session.cwd()
  if (repoFor?.cwd !== cwd) {
    const repo = await $.session.repo().catch(() => null)
    repoFor = { cwd, repo: parseGitHubRepo(repo?.remote) }
  }
  return repoFor.repo
}

export const register: Register = (on, options) => {
  // A change in /config reloads the module, so this is read once.
  const linkifyOptions = { repoRefs: options.repoRefs !== false }

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const repo = await currentRepo($)
    const key = `${repo ?? ''}\n${e.props.text}`
    let text = cache.get(key)
    if (text === undefined) {
      text = linkify(e.props.text, repo, linkifyOptions)
      cache.set(key, text)
      if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)
    }
    if (text === e.props.text) return next(e)
    // Only the drawing changes; the stored message and what the model
    // reads stay as written.
    return next({ ...e, props: { ...e.props, text } })
  })
}
