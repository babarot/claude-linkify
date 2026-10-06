import { expect, test } from 'claude-code/testing'

import { linkify, parseGitHubRepo } from '../hooks/linkify'

const REPO = 'babarot/gomi'

test('remotes of github.com name owner/repo; other hosts name none', () => {
  expect(parseGitHubRepo('git@github.com:babarot/gomi.git')).toBe(REPO)
  expect(parseGitHubRepo('https://github.com/babarot/gomi')).toBe(REPO)
  expect(parseGitHubRepo('https://github.com/babarot/gomi.git')).toBe(REPO)
  expect(parseGitHubRepo('ssh://git@github.com/babarot/gomi.git')).toBe(REPO)
  expect(parseGitHubRepo('https://gitlab.com/babarot/gomi.git')).toBeNull()
  expect(parseGitHubRepo(null)).toBeNull()
})

test('#123 links into the session repository', () => {
  expect(linkify('Fixed in #123.', REPO)).toBe('Fixed in [#123](https://github.com/babarot/gomi/issues/123).')
  expect(linkify('（#7）と #8 を参照', REPO)).toBe(
    '（[#7](https://github.com/babarot/gomi/issues/7)）と [#8](https://github.com/babarot/gomi/issues/8) を参照',
  )
  expect(linkify('#1,#2', REPO)).toBe(
    '[#1](https://github.com/babarot/gomi/issues/1),[#2](https://github.com/babarot/gomi/issues/2)',
  )
})

test('owner/repo#123 links anywhere, with or without a session repository', () => {
  expect(linkify('see cli/cli#42', null)).toBe('see [cli/cli#42](https://github.com/cli/cli/issues/42)')
})

test('what is not a reference stays text', () => {
  expect(linkify('PR#1 a&#123; #12abc #1-2 color: #fff', REPO)).toBe('PR#1 a&#123; #12abc #1-2 color: #fff')
  expect(linkify('# Heading', REPO)).toBe('# Heading')
  // Without a session repository a bare #123 has nowhere to point.
  expect(linkify('Fixed in #123', null)).toBe('Fixed in #123')
})

test('bare URLs become links, without the punctuation around them', () => {
  expect(linkify('Open https://example.com/a?b=1.', null)).toBe(
    'Open [https://example.com/a?b=1](https://example.com/a?b=1).',
  )
  expect(linkify('https://example.comを見て', null)).toBe('[https://example.com](https://example.com)を見て')
  expect(linkify('(see https://example.com/x)', null)).toBe('(see [https://example.com/x](https://example.com/x))')
  expect(linkify('https://en.wikipedia.org/wiki/Foo_(bar)', null)).toBe(
    '[https://en.wikipedia.org/wiki/Foo\\_(bar)](<https://en.wikipedia.org/wiki/Foo_(bar)>)',
  )
  // A URL's own fragment is part of the URL, not a reference.
  expect(linkify('https://example.com/a#12', REPO)).toBe('[https://example.com/a#12](https://example.com/a#12)')
})

test('code and existing links are left alone', () => {
  const text = [
    'Run `gh issue view #12` or open [the PR](https://github.com/x/y/pull/3).',
    '<https://example.com>',
    '```sh',
    'curl https://example.com # see #5',
    '```',
    'then #6',
  ].join('\n')
  expect(linkify(text, REPO)).toBe(
    [
      'Run `gh issue view #12` or open [the PR](https://github.com/x/y/pull/3).',
      '<https://example.com>',
      '```sh',
      'curl https://example.com # see #5',
      '```',
      'then [#6](https://github.com/babarot/gomi/issues/6)',
    ].join('\n'),
  )
})

test('a reply is drawn with its references linked, the stored text untouched', async ($, on) => {
  on('session.start', () => ({ cwd: '/work' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.repo', () => ({
    value: { root: '/work', remote: 'git@github.com:babarot/gomi.git', internal: false, name: null },
  }))
  on('ui.render', ($, e) => ({ type: 'Text', props: {}, children: [(e.props as { text: string }).text] }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({
    plugin: 'linkify',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'msg-1',
    props: { text: 'Closed by #9.', isFirstOfReply: true },
  })
  expect(await ui.find({ type: 'Text', text: 'Closed by [#9](https://github.com/babarot/gomi/issues/9).' })).toBeDefined()
  await ui.unmount()
})
