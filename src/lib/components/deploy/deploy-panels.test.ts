/**
 * The Deploy view's Review and Publish panels, rendered server-side from a
 * DeployPage in a prepared state - no desktop app. Pins each check state to
 * its glyph and what holds back an automatic publish.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { DeployPage } from '$lib/state/deploy-page.svelte';
import type { ReleaseCheck } from '$lib/services/release-checks';
import ReviewPanel from './ReviewPanel.svelte';
import PublishPanel from './PublishPanel.svelte';

const check = (
  id: string,
  state: ReleaseCheck['state'],
  blocking = false,
): ReleaseCheck => ({
  id,
  title: `Check ${id}`,
  state,
  text: `About ${id}`,
  details: [],
  blocking,
});

function preparedPage(checks: ReleaseCheck[]): DeployPage {
  const page = new DeployPage();
  page.review = {
    prepare: { at: 1_700_000_000, siteVersion: '2.10.0' } as never,
    published: null,
    unpublished: true,
    checks,
  };
  return page;
}

/** The glyph class each check row draws, keyed by the check's title. */
function glyphs(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re =
    /class="step-status (step-status-\w+|review-state-info)[^"]*"[\s\S]*?<strong>(Check [^<]+)<\/strong>/g;
  for (const m of body.matchAll(re)) out[m[2]] = m[1];
  return out;
}

describe('ReviewPanel', () => {
  it('draws each check state with its step glyph', () => {
    const body = render(ReviewPanel, {
      props: {
        page: preparedPage([
          check('a', 'ok'),
          check('b', 'warn'),
          check('c', 'fail'),
          check('d', 'info'),
        ]),
      },
    }).body;
    expect(glyphs(body)).toEqual({
      'Check a': 'step-status-done',
      'Check b': 'step-status-warn',
      'Check c': 'step-status-failed',
      'Check d': 'review-state-info',
    });
    expect(body).toContain('Not published yet');
  });

  it('says how many blocking checks hold back an automatic publish', () => {
    const body = render(ReviewPanel, {
      props: {
        page: preparedPage([
          check('a', 'warn', true),
          check('b', 'fail', true),
          check('c', 'warn'),
        ]),
      },
    }).body;
    expect(body).toContain('2 checks');
    expect(body).toContain('hold back an automatic publish');
  });
});

describe('PublishPanel', () => {
  it('offers Publish anyway while a blocking check is not ok', () => {
    const page = preparedPage([check('a', 'fail', true)]);
    page.overview = { siteDeployFolders: ['D:/site'], repos: [] } as never;
    const body = render(PublishPanel, { props: { page } }).body;
    expect(body).toContain('Copies the site to D:/site');
    expect(body).toContain('Publish anyway');
  });

  it('explains there is nowhere to publish without folders or scripts', () => {
    const page = preparedPage([]);
    page.overview = { siteDeployFolders: [], repos: [] } as never;
    const body = render(PublishPanel, { props: { page } }).body;
    expect(body).toContain("There's nowhere to publish to yet");
  });
});
