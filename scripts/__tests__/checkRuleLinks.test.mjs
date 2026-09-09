/**
 * @critical - this script is the only thing standing between the app and a
 * rulebook that quietly went out of date. Its own logic has to be regression
 * tested without the network, or the safety net is itself unverified.
 */
import { checkRuleLinks } from '../check-rule-links.mjs';

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
});
