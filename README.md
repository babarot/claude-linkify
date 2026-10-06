# claude-linkify

A Claude Code mod that makes links in Claude's replies clickable: bare URLs, and GitHub issue and pull request references like `#123` and `owner/repo#123`.

## Install

```sh
claude plugin marketplace add babarot/claude-linkify
claude plugin install linkify@claude-linkify
```

Then start a new session, or run `/reload-plugins` in one.

It needs a Claude Code version with mods (TypeScript plugin hooks). Tested with Claude Code 2.1.290 on macOS.

## What it links

| Written in a reply | Drawn as a link to |
| --- | --- |
| `#123` | `https://github.com/<owner>/<repo>/issues/123`, the repository of the session |
| `owner/repo#123` | `https://github.com/owner/repo/issues/123`, from any directory |
| `https://example.com/path` | itself |

- The repository for `#123` is read from the `origin` remote of the session's working directory, again whenever the directory changes. Outside a git repository, or when `origin` is not on github.com, `#123` stays text.
- A link to `/issues/123` also works for a pull request: GitHub redirects to it.
- A URL stops before punctuation that ends the sentence (`.`, `,`, an unbalanced `)`) and before non-ASCII text that follows it directly.

These are left alone:

- Fenced code blocks and inline code
- Existing markdown links and autolinks (`<https://...>`)
- References with a word character right before or after them, as GitHub's own autolinking does: `PR#1`, `#12abc`, `a&#123;`
- A `#` inside a URL (`https://example.com/a#12`)

Only the drawing changes. The stored message and what the model reads stay as written.

## How it works

The mod hooks `ui.render` for `AssistantMessage`, rewrites the block's markdown with the links added, and hands it on to Claude Code's own renderer. It runs no commands and makes no network requests: the repository comes from `$.session.repo()`.

The rewriting is a plain function in [hooks/linkify.ts](./hooks/linkify.ts), with no dependency on Claude Code.

## Develop

```sh
git clone https://github.com/babarot/claude-linkify
cd claude-linkify
claude --plugin-dir "$PWD"
claude plugin validate .
claude plugin test .
```

The editor types live in `.claude-plugin/types/`. Claude Code generates them when it loads the mod, and they are not committed.

## License

MIT
