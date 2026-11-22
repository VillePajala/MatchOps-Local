#!/usr/bin/env node
/**
 * Creates a club code that unlocks one playbook (playbook_codes, migration 067).
 *
 * The code is random, readable (groups of 4 from an alphabet without 0/O, 1/I/L),
 * with an optional prefix: "PEPO-7KQ2-M9XD-4HNA". It is PRINTED ONCE; only its
 * hash (hex sha256 of the normalised code: upper-case, no spaces or dashes - the
 * same normalisation as redeem_playbook_code) is written to the database. A lost
 * code cannot be recovered: revoke it and make a new one.
 *
 * Usage:
 *   node scripts/pelitapa/create-code.mjs --playbook pepo-8v8 \
 *     [--label "PEPO P2014 coaches"] [--prefix PEPO] [--max-uses 30] [--expires-days 90] \
 *     [--apply] [--project staging|production]
 * Without --apply it prints the code and the SQL (nothing written). --apply runs the
 * INSERT with the Supabase CLI's token (~/.supabase/access-token) against staging;
 * production needs `--project production` spelled out.
 *
 * Revoke:  UPDATE public.playbook_codes SET revoked = true WHERE label = '...';
 * Usage:   SELECT label, uses, max_uses, expires_at, revoked FROM public.playbook_codes;
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createHash, randomInt } from 'node:crypto';

export const PROJECTS = { staging: 'uncyxrffqrloypgjalzz', production: 'aybjmnxxtgspqesdiqxd' };

/** 31 characters, none easily mistaken for another (no 0 O 1 I L). */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const GROUPS = 3;
const GROUP_LEN = 4;
const PLAYBOOK_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const PREFIX = /^[A-Z0-9]{1,8}$/;

/** Upper-case, spaces and dashes removed: what is hashed (here and in the RPC). */
export function normaliseCode(code) {
  return String(code).replace(/[\s-]/g, '').toUpperCase();
}

export function hashCode(code) {
  return createHash('sha256').update(normaliseCode(code), 'utf8').digest('hex');
}

/** A new code: [PREFIX-]XXXX-XXXX-XXXX (~59 random bits). `rand(n)` is injectable for tests. */
export function generateCode({ prefix, rand = randomInt } = {}) {
  const groups = [];
  for (let g = 0; g < GROUPS; g++) {
    let s = '';
    for (let i = 0; i < GROUP_LEN; i++) s += CODE_ALPHABET[rand(CODE_ALPHABET.length)];
    groups.push(s);
  }
  if (prefix !== undefined && prefix !== '') {
    const p = String(prefix).toUpperCase();
    if (!PREFIX.test(p)) throw new Error('Prefix: 1-8 letters or digits');
    groups.unshift(p);
  }
  return groups.join('-');
}

/** SQL literal. */
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** The INSERT for one code (only its hash). */
export function buildCodeSql({ playbookId, code, label, maxUses, expiresDays }) {
  if (!PLAYBOOK_ID.test(playbookId ?? '')) throw new Error('--playbook: a playbook id (lowercase letters, digits, - and _)');
  if (maxUses !== undefined && !(Number.isInteger(maxUses) && maxUses > 0)) throw new Error('--max-uses: a positive whole number');
  if (expiresDays !== undefined && !(Number.isInteger(expiresDays) && expiresDays > 0)) throw new Error('--expires-days: a positive whole number');
  const expires = expiresDays !== undefined ? `now() + interval '${expiresDays} days'` : 'NULL';
  return [
    'INSERT INTO public.playbook_codes (code_hash, playbook_id, label, expires_at, max_uses)',
    `  SELECT ${lit(hashCode(code))}, p.id, ${label ? lit(label) : 'NULL'}, ${expires}, ${maxUses ?? 'NULL'}`,
    `  FROM public.playbooks p WHERE p.id = ${lit(playbookId)}`,
    '  RETURNING playbook_id, label, expires_at, max_uses;',
    '',
  ].join('\n');
}

async function run(ref, sql) {
  const token = readFileSync(`${homedir()}/.supabase/access-token`, 'utf8').trim();
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${body}`);
  return JSON.parse(body);
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const num = (name) => (opt(name) === undefined ? undefined : Number(opt(name)));
  const playbookId = opt('playbook');
  if (!playbookId) {
    console.error('Usage: node scripts/pelitapa/create-code.mjs --playbook <id> [--label t] [--prefix P] [--max-uses n] [--expires-days n] [--apply] [--project staging|production]');
    process.exit(2);
  }
  const project = opt('project') ?? 'staging';
  const ref = PROJECTS[project];
  if (!ref) {
    console.error('--project: staging or production');
    process.exit(2);
  }
  const code = generateCode({ prefix: opt('prefix') });
  const sql = buildCodeSql({ playbookId, code, label: opt('label'), maxUses: num('max-uses'), expiresDays: num('expires-days') });
  if (!argv.includes('--apply')) {
    console.log(`Code (NOT saved - dry run): ${code}\n\n${sql}`);
    return;
  }
  const rows = await run(ref, sql);
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`No playbook "${playbookId}" in ${project}; nothing written.`);
  console.log(`${project}: code for "${playbookId}" saved (${JSON.stringify(rows[0])}).`);
  console.log(`\n  ${code}\n\nShown only now - only its hash is stored.`);
}

if (process.argv[1] && process.argv[1].endsWith('create-code.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
