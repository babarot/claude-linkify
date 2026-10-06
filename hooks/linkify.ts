// Turns bare URLs and GitHub references in markdown into markdown links,
// leaving code (fenced blocks, inline spans) and existing links alone.

const FENCE = /^ {0,3}(`{3,}|~{3,})/

// What must not be touched on a line: inline code, markdown links and
// images, and autolinks. Each is copied through as written.
const PROTECTED = /(`+)[^`]*?\1|!?\[[^\]\n]*\]\([^)\n]*\)|<[a-z][a-z0-9+.-]*:[^>\s]*>/gi

// A bare URL, ASCII only so it stops at Japanese text that follows it
// ("https://example.comを"), or a reference: #123, owner/repo#123 or
// name#123, not preceded by a word character (so a&#123; and the repo in
// owner/repo#1 stay out) and not followed by one.
const TOKEN =
  /(https?:\/\/[A-Za-z0-9\-._~:/?#@!$&'()*+,;=%]+)|(^|[^A-Za-z0-9_/#&@.-])(?:([A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+)|([A-Za-z0-9][A-Za-z0-9._-]*))?#(\d+)(?![A-Za-z0-9_-])/g

// name#123 where the name says what kind of thing #123 is in the session
// repository, rather than naming another repository.
const KINDS: Record<string, 'pull' | 'issues'> = {
  pr: 'pull',
  pull: 'pull',
  issue: 'issues',
  issues: 'issues',
}

// Words written before #123 that are no repository's name; those stay text
// instead of linking to a repository that does not exist.
const NOT_REPOS = new Set([
  'case',
  'chapter',
  'fig',
  'figure',
  'id',
  'item',
  'line',
  'mr',
  'no',
  'number',
  'option',
  'page',
  'part',
  'phase',
  'round',
  'row',
  'section',
  'step',
  'task',
  'test',
  'ticket',
  'v',
  'version',
])

export type LinkifyOptions = {
  /** name#123 links to the repository `name` of the session repository's owner. */
  repoRefs: boolean
}

/** The `owner/repo` of a github.com remote URL, or null for any other host. */
export function parseGitHubRepo(remote: string | null | undefined): string | null {
  if (!remote) return null
  const match =
    /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?github\.com[:/](?::\d+\/)?([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(
      remote.trim(),
    )
  return match ? `${match[1]}/${match[2]}` : null
}

/** A URL without the punctuation that ends the sentence around it. */
function trimUrl(url: string): string {
  let end = url.length
  for (;;) {
    const last = url[end - 1] ?? ''
    if (/[.,;:!?'*]/.test(last)) {
      end--
      continue
    }
    if (last === ')') {
      const body = url.slice(0, end)
      if (body.split('(').length < body.split(')').length) {
        end--
        continue
      }
    }
    return url.slice(0, end)
  }
}

function link(text: string, href: string): string {
  const label = text.replace(/([\\*_~[\]])/g, '\\$1')
  const dest = /[()\s]/.test(href) ? `<${href}>` : href
  return `[${label}](${dest})`
}

/** Where a reference points, or null when it stays text. */
function resolveRef(
  qualified: string | undefined,
  name: string | undefined,
  num: string,
  repo: string | null,
  options: LinkifyOptions,
): string | null {
  // /issues/<n> redirects to the pull request when the number is one.
  if (qualified !== undefined) return `https://github.com/${qualified}/issues/${num}`
  if (repo === null) return null
  if (name === undefined) return `https://github.com/${repo}/issues/${num}`
  const lower = name.toLowerCase()
  const kind = KINDS[lower]
  if (kind !== undefined) return `https://github.com/${repo}/${kind}/${num}`
  if (!options.repoRefs || NOT_REPOS.has(lower) || /^\d+$/.test(name)) return null
  const owner = repo.slice(0, repo.indexOf('/'))
  return `https://github.com/${owner}/${name}/issues/${num}`
}

function linkifyPlain(text: string, repo: string | null, options: LinkifyOptions): string {
  return text.replace(
    TOKEN,
    (
      whole,
      url: string | undefined,
      before: string,
      qualified: string | undefined,
      name: string | undefined,
      num: string,
    ) => {
      if (url !== undefined) {
        const trimmed = trimUrl(url)
        return link(trimmed, trimmed) + url.slice(trimmed.length)
      }
      const href = resolveRef(qualified, name, num, repo, options)
      if (href === null) return whole
      return before + link(`${qualified ?? name ?? ''}#${num}`, href)
    },
  )
}

function linkifyLine(line: string, repo: string | null, options: LinkifyOptions): string {
  let out = ''
  let last = 0
  for (const match of line.matchAll(PROTECTED)) {
    out += linkifyPlain(line.slice(last, match.index), repo, options) + match[0]
    last = match.index + match[0].length
  }
  return out + linkifyPlain(line.slice(last), repo, options)
}

/**
 * The markdown with bare URLs and issue references made links. `repo` is
 * the session's `owner/repo`, which #123, PR#123 and name#123 point into;
 * null leaves them as text.
 */
export function linkify(markdown: string, repo: string | null, options: LinkifyOptions = { repoRefs: true }): string {
  if (!markdown.includes('http') && !markdown.includes('#')) return markdown
  let fence: string | null = null
  return markdown
    .split('\n')
    .map(line => {
      const marker = FENCE.exec(line)?.[1]
      if (fence !== null) {
        // A fence closes with the same character, at least as many times.
        if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) fence = null
        return line
      }
      if (marker !== undefined) {
        fence = marker
        return line
      }
      // Indented code blocks are not told apart from nested list items,
      // which replies use far more; both are linkified.
      return linkifyLine(line, repo, options)
    })
    .join('\n')
}
