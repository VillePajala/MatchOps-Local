/**
 * Club code generator, normaliser and the INSERT it writes (only the hash).
 */
import { createHash } from 'node:crypto';
import { CODE_ALPHABET, buildCodeSql, generateCode, hashCode, normaliseCode } from '../create-code.mjs';

describe('create-code', () => {
  it('generates three groups of four from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCode();
      expect(code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    }
    expect(CODE_ALPHABET).not.toMatch(/[01ILO]/);
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length);
  });

  it('puts an optional prefix first (upper-cased) and refuses a bad one', () => {
    const seq = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    let i = 0;
    expect(generateCode({ prefix: 'pepo', rand: () => seq[i++] })).toBe('PEPO-2345-6789-ABCD');
    expect(() => generateCode({ prefix: 'PE-PO' })).toThrow('Prefix');
    expect(() => generateCode({ prefix: 'TOOLONGPREFIX' })).toThrow('Prefix');
  });

  it('normalises like the app and the database: upper-case, no spaces or dashes', () => {
    expect(normaliseCode(' pepo-7kq2 m9xd ')).toBe('PEPO7KQ2M9XD');
  });

  it('hashes the normalised code (hex sha256), so any spelling of a code gives one hash', () => {
    const expected = createHash('sha256').update('PEPO7KQ2M9XD').digest('hex');
    expect(hashCode('PEPO-7KQ2-M9XD')).toBe(expected);
    expect(hashCode('pepo 7kq2-m9xd')).toBe(expected);
  });

  /** @critical the plain code never reaches the database */
  it('writes only the hash, with label, expiry and max uses', () => {
    const code = 'PEPO-7KQ2-M9XD-4HNA';
    const sql = buildCodeSql({ playbookId: 'pepo-8v8', code, label: "Coach's code", maxUses: 5, expiresDays: 30 });
    expect(sql).toContain(hashCode(code));
    expect(sql).not.toContain('7KQ2');
    expect(sql).toContain("'Coach''s code'");
    expect(sql).toContain("now() + interval '30 days'");
    expect(sql).toContain(", 5\n");
    expect(sql).toContain("WHERE p.id = 'pepo-8v8'");
  });

  it('no expiry / max uses: NULL; bad input refused', () => {
    const sql = buildCodeSql({ playbookId: 'pepo-8v8', code: 'ABCD-EFGH-JKMN' });
    expect(sql).toMatch(/NULL, NULL, NULL\n/);
    expect(() => buildCodeSql({ playbookId: "x'; drop", code: 'A' })).toThrow('--playbook');
    expect(() => buildCodeSql({ playbookId: 'pb', code: 'A', maxUses: 0 })).toThrow('--max-uses');
    expect(() => buildCodeSql({ playbookId: 'pb', code: 'A', expiresDays: 1.5 })).toThrow('--expires-days');
  });
});
