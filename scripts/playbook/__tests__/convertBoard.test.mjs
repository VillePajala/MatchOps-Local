/**
 * Converter and seed SQL on a small SYNTHETIC board (not club content).
 */
import { convertBoard, convertScenario, evaluateBoard, extractBoardSource } from '../convert-board.mjs';
import { buildSeedSql, checkContent } from '../seed-playbook.mjs';

const BOARD = `<html><body><svg id="pitch"></svg><script>
(()=>{
/* ---------- formations (synthetic) ---------- */
const US={1:[34,95],2:[20,70],3:[48,70]};
const THEM={a1:[34,5],a2:[34,40]};
const pa=(f,to,n,b)=>({k:'pass',f,to,n,b:b||0});
const lo=(f,to,b,n)=>({k:'long',f,to,b:b||0,n});
const ru=(f,to,b,n)=>({k:'run',f,to,b:b||0,n});
const dr=(f,to,b,n)=>({k:'drib',f,to,b:b||0,n});
const pr=(f,to,b)=>({k:'press',f,to,b:b||0});
const sh=(f,to)=>({k:'shot',f,to});
const E=(cx,cy,rx,ry,l)=>({k:'ell',cx,cy,rx,ry,l});
const R=(x,y,w,h,l)=>({k:'rect',x,y,w,h,l});
const BAND=(y,l)=>({k:'band',y,l});
const POLY=(ids,l)=>({k:'poly',ids,l});
const LINK=(a,b)=>({k:'link',ids:[a,b]});
const PHASES={hyok:{n:'Attack'}};
const SC=[
{id:'synthetic',ph:'hyok',title:'Synthetic',q:'Why?',steps:[
 {t:'Start',x:'Keeper has it.',p:{...US,...THEM},ball:'1',a:[pa('1','2',1),lo('1',[34,20],0),ru('3',[48,50],10)],z:[BAND(70,'Line'),E(20,60,5,5,'')]},
 {t:'Move',x:'Wide.',p:{2:[10,60]},hl:['2'],z:[POLY(['1','2','3']),LINK('2','3'),R(0,0,10,10,'Box')]},
 {t:'Again',x:'Back to start.',cut:1,p:{...US},ball:[30,50],a:[dr('2',[20,40],0,3),pr('a2','2'),sh('3',[34,0])]}
]}
];
const byId=Object.fromEntries(SC.map(s=>[s.id,s]));
})();
</script></body></html>`;

describe('convert-board', () => {
  it('extracts and evaluates the data block', () => {
    const { SC } = evaluateBoard(extractBoardSource(BOARD));
    expect(SC.map((s) => s.id)).toEqual(['synthetic']);
  });

  it('refuses a block that reaches outside plain data', () => {
    expect(() => evaluateBoard('const SC=[]; process.exit(1);')).toThrow(/refusing/);
    expect(() => extractBoardSource('<html></html>')).toThrow(/not found/);
  });

  it('maps a scenario onto the concept format', () => {
    const { concepts, gaps } = convertBoard(BOARD, { format: '5v5', phases: { hyok: 'Hyökkääminen' } });
    expect(gaps).toEqual([]);
    const [c] = concepts;
    expect(c).toMatchObject({ id: 'synthetic', title: 'Synthetic', phase: 'Hyökkääminen', format: '5v5', version: 1, question: 'Why?' });
    // Players from the first step: ours first, keepers marked.
    expect(c.players).toEqual([
      { id: '1', side: 'us', role: 'gk', start: [34, 95] },
      { id: '2', side: 'us', start: [20, 70] },
      { id: '3', side: 'us', start: [48, 70] },
      { id: 'a1', side: 'opp', role: 'gk', start: [34, 5] },
      { id: 'a2', side: 'opp', start: [34, 40] },
    ]);
    const [s0, s1, s2] = c.steps;
    expect(s0).not.toHaveProperty('positions');
    expect(s0.ball).toBe('1');
    expect(s0.arrows).toEqual([
      { kind: 'pass', from: '1', to: '2', label: '1' },
      { kind: 'long', from: '1', to: [34, 20], bend: 0 }, // straight on the board stays straight
      { kind: 'run', from: '3', to: [48, 50], bend: 0.5 }, // 10 units over a 20-unit arrow
    ]);
    expect(s0.zones).toEqual([
      { kind: 'band', y: 70, h: 5.6, label: 'Line' },
      { kind: 'ellipse', cx: 20, cy: 60, rx: 5, ry: 5 },
    ]);
    expect(s1).toMatchObject({ positions: { 2: [10, 60] }, highlights: ['2'] });
    expect(s1.zones).toEqual([
      { kind: 'poly', ids: ['1', '2', '3'] },
      { kind: 'link', ids: ['2', '3'] },
      { kind: 'rect', x: 0, y: 0, w: 10, h: 10, label: 'Box' },
    ]);
    expect(s2).toMatchObject({ cut: true, ball: [30, 50], positions: { 1: [34, 95], 2: [20, 70], 3: [48, 70] } });
    expect(s2.arrows.map((a) => a.kind)).toEqual(['drib', 'press', 'shot']);
    expect(s2.arrows[0].label).toBe('3');
  });

  it('reports what it cannot carry: removed and late players, unknown phases', () => {
    const { gaps, concept } = convertScenario(
      {
        id: 's',
        ph: 'zzz',
        title: 'S',
        steps: [
          { t: 'A', x: '', p: { 1: [1, 1], 2: [2, 2] } },
          { t: 'B', x: '', p: { 2: null, 3: [3, 3] } },
        ],
      },
      { phases: {} },
    );
    expect(concept.players.map((p) => p.id)).toEqual(['1', '2', '3']);
    expect(gaps).toEqual([
      's: step "B" removes player 2; concepts keep every player on the pitch',
      's: player 3 appears after the first step; it is shown from the start',
      's: unknown phase "zzz", kept as is',
    ]);
  });
});

describe('seed-playbook', () => {
  const doc = {
    playbook: { id: 'synthetic-pb', name: "Coach's book" },
    concepts: [
      { id: 'c1', format: '8v8', phase: 'Hyökkääminen', title: "It's $$ here" },
      { id: 'c2', format: '5v5', phase: 'Puolustaminen', title: 'Two' },
    ],
  };

  it('upserts the playbook and its concepts, removes dropped ones, grants by e-mail', () => {
    const sql = buildSeedSql(doc, { grantEmails: ['Coach@Example.com'] });
    expect(sql).toContain("VALUES ('synthetic-pb', 'Coach''s book', NULL)");
    expect(sql).toContain("('synthetic-pb', 'c1', '8v8', 'Hyökkääminen', 0, $c");
    expect(sql).toContain("('synthetic-pb', 'c2', '5v5', 'Puolustaminen', 1, $c");
    expect(sql).toContain("DELETE FROM public.playbook_concepts WHERE playbook_id = 'synthetic-pb' AND id NOT IN ('c1', 'c2');");
    expect(sql).toContain("lower(u.email) IN ('coach@example.com')");
    expect(sql).toContain('THEN public.playbook_concepts.version + 1');
    // The JSON goes in dollar-quoted, untouched.
    const tag = sql.match(/(\$c[0-9a-f]{8}\$)\{"id":"c1"/)[1];
    expect(sql).toContain(`${tag}${JSON.stringify(doc.concepts[0])}${tag}::jsonb`);
  });

  it('no grants without e-mails; refuses bad content and bad e-mails', () => {
    expect(buildSeedSql(doc)).not.toContain('playbook_access (playbook_id');
    expect(() => buildSeedSql(doc, { grantEmails: ["x'@y.z"] })).toThrow(/Not an e-mail/);
    expect(() => checkContent({ playbook: { id: 'Bad Id', name: '' }, concepts: [{ id: 'a', format: '7v7', phase: '' }, { id: 'a', format: '8v8', phase: 'P' }] })).toThrow(
      /playbook\.id[\s\S]*playbook\.name[\s\S]*concepts\[0\]\.format[\s\S]*concepts\[0\]\.phase[\s\S]*concepts\[1\]\.id: duplicate/,
    );
  });
});
