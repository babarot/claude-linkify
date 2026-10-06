// Turns bare URLs and GitHub references in markdown into markdown links,
// leaving code (fenced blocks, inline spans) and existing links alone.

const FENCE = /^ {0,3}(`{3,}|~{3,})/

// What must not be touched on a line: inline code, markdown links and
// images, and autolinks. Each is copied through as written.
const PROTECTED = /(`+)[^`]*?\1|!?\[[^\]\n]*\]\([^)\n]*\)|<[a-z][a-z0-9+.-]*:[^>\s]*>/gi

// A bare URL, ASCII only so it stops at Japanese text that follows it
// ("https://example.comを"), or a reference: #123 or owner/repo#123, not
// preceded by a word character (as GitHub autolinks them, so PR#1 and
// a&#123; stay text) and not followed by one.
const TOKEN =
  /(https?:\/\/[A-Za-z0-9\-._~:/?#@!$&'()*+,;=%]+)|(^|[^A-Za-z0-9_/#&@.-])(?:([A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+))?#(\d+)(?![A-Za-z0-9_-])/g

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

function linkifyPlain(text: string, repo: string | null): string {
  return text.replace(TOKEN, (whole, url: string | undefined, before: string, qualified: string | undefined, num: string) => {
    if (url !== undefined) {
      const trimmed = trimUrl(url)
      return link(trimmed, trimmed) + url.slice(trimmed.length)
    }
    const target = qualified ?? repo
    if (target === null) return whole
    const label = qualified ? `${qualified}#${num}` : `#${num}`
    // /issues/<n> redirects to the pull request when the number is one.
    return before + link(label, `https://github.com/${target}/issues/${num}`)
  })
}

function linkifyLine(line: string, repo: string | null): string {
  let out = ''
  let last = 0
  for (const match of line.matchAll(PROTECTED)) {
    out += linkifyPlain(line.slice(last, match.index), repo) + match[0]
    last = match.index + match[0].length
  }
  return out + linkifyPlain(line.slice(last), repo)
}

/**
 * The markdown with bare URLs and issue references made links. `repo` is
 * the `owner/repo` that `#123` points into; null leaves `#123` as text.
 */
export function linkify(markdown: string, repo: string | null): string {
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
      return linkifyLine(line, repo)
    })
    .join('\n')
}
