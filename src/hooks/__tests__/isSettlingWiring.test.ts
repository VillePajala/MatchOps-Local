/**
 * @critical - REGRESSION. `isSettling` is what stops the match booting into the
 * demo workspace while its data is still arriving. It was added to
 * useTeamGameDataQueries, which the boot does not call, and typed optional - so
 * the missing value coerced to false and the fix silently did nothing through a
 * whole review round. This pins it to the chain that actually runs.
 */
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const queries = read('src/hooks/useGameDataQueries.ts');
const management = read('src/components/HomePage/hooks/useGameDataManagement.ts');
const orchestration = read('src/components/HomePage/hooks/useGameOrchestration.ts');

/** The body of one exported function, up to the next top-level export. */
const bodyOf = (source: string, fn: string) => {
  const start = source.indexOf(`export function ${fn}`);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf('\nexport function ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
};

describe('the hook the boot actually calls', () => {
  /** useGameDataManagement destructures this one; the team variant is unused here. */
  it('is useGameDataQueries', () => {
    expect(management).toContain('} = useGameDataQueries();');
  });

  it('computes isSettling', () => {
    const body = bodyOf(queries, 'useGameDataQueries');
    expect(body).toContain('const isSettling =');
    expect(body).toMatch(/savedGames\.isFetching \|\| currentGameId\.isFetching/);
  });

  it('returns it', () => {
    expect(bodyOf(queries, 'useGameDataQueries')).toMatch(/\n\s*isSettling,/);
  });

  /** The other variant keeps it too, so the two cannot drift apart. */
  it('so does the team variant', () => {
    const body = bodyOf(queries, 'useTeamGameDataQueries');
    expect(body).toContain('const isSettling =');
    expect(body).toMatch(/\n\s*isSettling,/);
  });
});

describe('it survives the whole chain to the boot', () => {
  it('management passes it straight through, uncoerced', () => {
    expect(management).toContain('isSettling: isGameDataSettling,');
    // Boolean() here is what let an absent value read as false.
    expect(management).not.toContain('Boolean(isGameDataSettling)');
  });

  it('the boot waits on it instead of falling back', () => {
    expect(orchestration).toContain('gameDataManagement.isSettling');
  });

  /** Waiting on a refetch only works if the effect re-runs when it lands. */
  it('and re-runs when it changes', () => {
    const deps = orchestration.slice(orchestration.indexOf('loadInitialAppData();'));
    expect(deps).toContain('gameDataManagement.isSettling,');
  });
});

describe('the type cannot hide a missing value again', () => {
  /**
   * Optional is precisely how this went unnoticed: wiring it to the wrong hook
   * produced `undefined`, which coerced to false, which reads as "settled".
   */
  it('is required on both result types', () => {
    expect(queries).not.toContain('isSettling?: boolean;');
    expect(queries.match(/isSettling: boolean;/g) ?? []).toHaveLength(2);
  });
});
