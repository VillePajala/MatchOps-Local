/**
 * @critical - this script is the only thing standing between the app and a
 * rulebook that quietly went out of date. Its own logic has to be regression
 * tested without the network, or the safety net is itself unverified.
 */
import { readFileSync } from 'node:fs';
import { checkRuleLinks, pageLinksTo } from '../check-rule-links.mjs';

const PDF = 'https://cdn.example.org/rules-2026.pdf';
const INDEX = 'https://example.org/rules';

const config = {
  indexPage: INDEX,
  checkedOn: '2026-09-09',
  links: [{ id: 'rules', url: PDF, listedOn: INDEX }],
};

/** Minimal Response stand-in; only what the script actually reads. */
const res = (ok, { status = ok ? 200 : 404, body = '', headers = {} } = {}) => ({
  ok,
  status,
  text: async () => body,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
});

describe('checkRuleLinks', () => {
  it('passes when the document loads and the page still links it', async () => {
    const fetchImpl = jest.fn(async (url) =>
      url === INDEX ? res(true, { body: `<a href="${PDF}">Rules</a>` }) : res(true),
    );
    const { problems } = await checkRuleLinks(config, fetchImpl);
    expect(problems).toEqual([]);
  });

  /**
   * @critical - the actual 2026-09-09 defect. The superseded PDF answered 200
   * exactly like the current one; only its absence from the listing gave it
   * away, so a reachability-only check would have stayed silent.
   */
  it('fails a link that still loads but is no longer listed', async () => {
    const fetchImpl = jest.fn(async (url) =>
      url === INDEX ? res(true, { body: '<a href="https://cdn.example.org/rules-2027.pdf">Rules</a>' }) : res(true),
    );
    const { problems } = await checkRuleLinks(config, fetchImpl);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no longer links');
  });

  it('reports an unreachable document', async () => {
    const fetchImpl = jest.fn(async (url) =>
      url === INDEX ? res(true, { body: `<a href="${PDF}">Rules</a>` }) : res(false, { status: 404 }),
    );
    const { problems } = await checkRuleLinks(config, fetchImpl);
    expect(problems.some((p) => p.includes('HTTP 404'))).toBe(true);
  });

  it('falls back to GET when the CDN refuses HEAD', async () => {
    const fetchImpl = jest.fn(async (url, opts) => {
      if (url === INDEX) return res(true, { body: `<a href="${PDF}">Rules</a>` });
      return opts.method === 'HEAD' ? res(false, { status: 405 }) : res(true);
    });
    const { problems } = await checkRuleLinks(config, fetchImpl);
    expect(problems).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledWith(PDF, expect.objectContaining({ method: 'HEAD' }));
    expect(fetchImpl).toHaveBeenCalledWith(PDF, expect.objectContaining({ method: 'GET' }));
  });

  it('says so when the listing page itself cannot be read, rather than passing quietly', async () => {
    const fetchImpl = jest.fn(async (url) => (url === INDEX ? res(false, { status: 503 }) : res(true)));
    const { problems } = await checkRuleLinks(config, fetchImpl);
    expect(problems.some((p) => p.includes('supersession could not be checked'))).toBe(true);
  });

  it('a thrown request is a problem, not a crash', async () => {
    const fetchImpl = jest.fn(async (url) => {
      if (url === INDEX) return res(true, { body: `<a href="${PDF}">Rules</a>` });
      throw new Error('ENOTFOUND');
    });
    const { problems } = await checkRuleLinks(config, fetchImpl);
    expect(problems.some((p) => p.includes('ENOTFOUND'))).toBe(true);
  });

  it('fetches a shared listing page once, however many links cite it', async () => {
    const two = { ...config, links: [config.links[0], { id: 'other', url: PDF, listedOn: INDEX }] };
    const fetchImpl = jest.fn(async (url) =>
      url === INDEX ? res(true, { body: `<a href="${PDF}">Rules</a>` }) : res(true),
    );
    await checkRuleLinks(two, fetchImpl);
    expect(fetchImpl.mock.calls.filter(([url]) => url === INDEX)).toHaveLength(1);
  });

  it('checks reachability only when a link names no listing page', async () => {
    const bare = { ...config, links: [{ id: 'index', url: INDEX }] };
    const fetchImpl = jest.fn(async () => res(true));
    const { problems } = await checkRuleLinks(bare, fetchImpl);
    expect(problems).toEqual([]);
  });

  /**
   * @edge-case - a HEAD that throws says no more than a HEAD that 405s. Treating
   * it as fatal reported a perfectly reachable document as broken.
   */
  it('falls back to GET when HEAD throws, not just when it returns not-ok', async () => {
    const fetchImpl = jest.fn(async (url, opts) => {
      if (url === INDEX) return res(true, { body: `<a href="${PDF}">Rules</a>` });
      if (opts.method === 'HEAD') throw new Error('ECONNRESET');
      return res(true);
    });
    const { problems } = await checkRuleLinks(config, fetchImpl);
    expect(problems).toEqual([]);
  });
});

/**
 * @critical - a false alarm is worse than no check: a maintenance job that
 * cries wolf is one people learn to ignore, which is how the stale futsal link
 * would survive a second time.
 */
describe('pageLinksTo', () => {
  it('matches a plain href', () => {
    expect(pageLinksTo(`<a href="${PDF}">x</a>`, PDF)).toBe(true);
  });

  it('does not match a different document', () => {
    expect(pageLinksTo('<a href="https://cdn.example.org/other.pdf">x</a>', PDF)).toBe(false);
  });

  it('matches when the page HTML-escapes the ampersands in a query string', () => {
    const url = 'https://cdn.example.org/r.pdf?a=1&b=2';
    expect(pageLinksTo('<a href="https://cdn.example.org/r.pdf?a=1&amp;b=2">x</a>', url)).toBe(true);
    expect(pageLinksTo('<a href="https://cdn.example.org/r.pdf?a=1&#38;b=2">x</a>', url)).toBe(true);
    expect(pageLinksTo('<a href="https://cdn.example.org/r.pdf?a=1&#x26;b=2">x</a>', url)).toBe(true);
  });
});

/**
 * The config's own invariant, enforced rather than described: an entry without
 * a listing page silently degrades to a reachability check, which is exactly
 * the blind spot this whole mechanism exists to close.
 */
describe('ruleLinks.json', () => {
  const real = JSON.parse(
    readFileSync(new URL('../../src/config/ruleLinks.json', import.meta.url), 'utf8'),
  );

  it('gives every link a listing page, except the index page itself', () => {
    for (const link of real.links) {
      if (link.url === real.indexPage) {
        expect(link.listedOn).toBeUndefined();
      } else {
        expect(typeof link.listedOn).toBe('string');
      }
    }
  });
});
