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

test('PR#, issue# and repo# point into the session repository and its owner', () => {
  const repo = 'acme/web'
  expect(linkify('PR#1', repo)).toBe('[PR#1](https://github.com/acme/web/pull/1)')
  expect(linkify('pr#1 and pull#1', repo)).toBe(
    '[pr#1](https://github.com/acme/web/pull/1) and [pull#1](https://github.com/acme/web/pull/1)',
  )
  expect(linkify('issue#2', repo)).toBe('[issue#2](https://github.com/acme/web/issues/2)')
  expect(linkify('api#3', repo)).toBe('[api#3](https://github.com/acme/api/issues/3)')
  expect(linkify('（docs#5）を参照', repo)).toBe('（[docs#5](https://github.com/acme/docs/issues/5)）を参照')
  expect(linkify('babarot/hoge#1', repo)).toBe('[babarot/hoge#1](https://github.com/babarot/hoge/issues/1)')
  expect(linkify('#4', repo)).toBe('[#4](https://github.com/acme/web/issues/4)')
})

test('repo#123 can be turned off, leaving PR#, issue# and #123', () => {
  const off = { repoRefs: false }
  expect(linkify('api#3', REPO, off)).toBe('api#3')
  expect(linkify('PR#1', REPO, off)).toBe('[PR#1](https://github.com/babarot/gomi/pull/1)')
})

test('what is not a reference stays text', () => {
  expect(linkify('Step#1 no#2 v#3 123#4 a&#123; #12abc #1-2 color: #fff', REPO)).toBe(
    'Step#1 no#2 v#3 123#4 a&#123; #12abc #1-2 color: #fff',
  )
  expect(linkify('# Heading', REPO)).toBe('# Heading')
  // Without a session repository, nothing short has anywhere to point.
  expect(linkify('Fixed in #123, PR#4 and gomi#5', null)).toBe('Fixed in #123, PR#4 and gomi#5')
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

test('repoRefs off in the settings leaves repo#123 as text', { options: { repoRefs: false } }, async ($, on) => {
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
    props: { text: 'See afx#2 and PR#3.', isFirstOfReply: true },
  })
  expect(await ui.find({ type: 'Text', text: 'See afx#2 and [PR#3](https://github.com/babarot/gomi/pull/3).' })).toBeDefined()
  await ui.unmount()
})
