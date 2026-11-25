#!/usr/bin/env node
/**
 * Seeds one Playbook playbook into Supabase FROM a committed content file
 * (content/playbook/*.json: { playbook: { id, name, ownerNote? }, concepts: [...] })
 * and optionally grants accounts access to it.
 *
 * The content file is the source of truth; the database is what the app reads
 * (playbooks / playbook_concepts / playbook_access, migration 065). The upsert:
 * - creates or renames the playbook;
 * - upserts every concept (format / phase / sort from the document and its
 *   position in the file); `version` goes up only when the JSON changed;
 * - deletes the playbook's concepts that are no longer in the file;
 * - grants access to the given e-mails (existing accounts only; unknown
 *   e-mails are reported, not created).
 * All of it is one statement batch; the Management API runs it in a
 * transaction, so a failure changes nothing.
 *
 * STAGING ONLY by default. Usage:
 *   node scripts/playbook/seed-playbook.mjs content/playbook/pepo-8v8.json \
 *     [--grant coach@example.com[,other@example.com]] [--sql-out file.sql] [--apply]
 * Without --apply it only prints / writes the SQL. --apply runs it against
 * staging with the Supabase CLI's token (~/.supabase/access-token).
 * Validity of the concepts is checked by the app's validator in
 * src/playbook/__tests__/playbookContent.test.ts; this script checks the
 * shape it needs (ids, format, phase) and refuses anything else.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

export const STAGING_REF = 'uncyxrffqrloypgjalzz';

const FORMATS = new Set(['5v5', '8v8', '11v11']);
const PLAYBOOK_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const EMAIL = /^[^\s@'"\\]+@[^\s@'"\\]+\.[^\s@'"\\]+$/;

/** SQL string literal. */
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** A dollar-quote tag that does not occur in the text. */
function dollarTag(text) {
  for (;;) {
    const tag = `$c${randomBytes(4).toString('hex')}$`;
    if (!text.includes(tag)) return tag;
  }
}

/** Checks the content file's shape; throws with every problem found. */
export function checkContent(doc) {
  const errors = [];
  const pb = doc?.playbook;
  if (!pb || !PLAYBOOK_ID.test(pb.id ?? '')) errors.push('playbook.id: lowercase letters, digits, - and _ only');
  if (!pb || typeof pb.name !== 'string' || !pb.name.trim()) errors.push('playbook.name: missing');
  if (!Array.isArray(doc?.concepts) || doc.concepts.length === 0) errors.push('concepts: must be a non-empty list');
  const seen = new Set();
  (doc?.concepts ?? []).forEach((c, i) => {
    if (typeof c?.id !== 'string' || !c.id.trim()) errors.push(`concepts[${i}].id: missing`);
    else if (seen.has(c.id)) errors.push(`concepts[${i}].id: duplicate "${c.id}"`);
    else seen.add(c.id);
    if (!FORMATS.has(c?.format)) errors.push(`concepts[${i}].format: must be 5v5, 8v8 or 11v11`);
    if (typeof c?.phase !== 'string' || !c.phase.trim()) errors.push(`concepts[${i}].phase: missing`);
  });
  if (errors.length) throw new Error(`Content file is not valid:\n  ${errors.join('\n  ')}`);
}

/** The upsert (and optional grants) as one SQL batch. */
export function buildSeedSql(doc, { grantEmails = [] } = {}) {
  checkContent(doc);
  for (const e of grantEmails) if (!EMAIL.test(e)) throw new Error(`Not an e-mail address: ${e}`);
  const { playbook, concepts } = doc;
  const pid = lit(playbook.id);
  const lines = [];
  lines.push(
    `INSERT INTO public.playbooks (id, name, owner_note) VALUES (${pid}, ${lit(playbook.name)}, ${
      playbook.ownerNote ? lit(playbook.ownerNote) : 'NULL'
    })`,
    `  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, owner_note = COALESCE(EXCLUDED.owner_note, public.playbooks.owner_note);`,
  );
  const rows = concepts.map((c, i) => {
    const json = JSON.stringify(c);
    const tag = dollarTag(json);
    return `  (${pid}, ${lit(c.id)}, ${lit(c.format)}, ${lit(c.phase)}, ${i}, ${tag}${json}${tag}::jsonb)`;
  });
  lines.push(
    'INSERT INTO public.playbook_concepts (playbook_id, id, format, phase, sort, data) VALUES',
    `${rows.join(',\n')}`,
    '  ON CONFLICT (playbook_id, id) DO UPDATE SET',
    '    format = EXCLUDED.format, phase = EXCLUDED.phase, sort = EXCLUDED.sort, data = EXCLUDED.data,',
    '    version = CASE WHEN public.playbook_concepts.data IS DISTINCT FROM EXCLUDED.data',
    '      THEN public.playbook_concepts.version + 1 ELSE public.playbook_concepts.version END,',
    '    updated_at = CASE WHEN public.playbook_concepts.data IS DISTINCT FROM EXCLUDED.data',
    '      THEN now() ELSE public.playbook_concepts.updated_at END;',
    `DELETE FROM public.playbook_concepts WHERE playbook_id = ${pid} AND id NOT IN (${concepts
      .map((c) => lit(c.id))
      .join(', ')});`,
  );
  if (grantEmails.length) {
    lines.push(
      `INSERT INTO public.playbook_access (playbook_id, user_id)`,
      `  SELECT ${pid}, u.id FROM auth.users u WHERE lower(u.email) IN (${grantEmails
        .map((e) => lit(e.toLowerCase()))
        .join(', ')})`,
      '  ON CONFLICT DO NOTHING;',
    );
  }
  // The batch's answer: what is now in the database.
  lines.push(
    `SELECT (SELECT count(*) FROM public.playbook_concepts WHERE playbook_id = ${pid}) AS concepts,`,
    `       (SELECT coalesce(json_agg(u.email ORDER BY u.email), '[]') FROM public.playbook_access a`,
    `          JOIN auth.users u ON u.id = a.user_id WHERE a.playbook_id = ${pid}) AS granted;`,
  );
  return `${lines.join('\n')}\n`;
}

async function runOnStaging(sql) {
  const token = readFileSync(`${homedir()}/.supabase/access-token`, 'utf8').trim();
  const res = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
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
  const file = argv[0] && !argv[0].startsWith('--') ? argv[0] : undefined;
  if (!file) {
    console.error('Usage: node scripts/playbook/seed-playbook.mjs <content.json> [--grant a@b.c,..] [--sql-out f.sql] [--apply]');
    process.exit(2);
  }
  if (process.env.SEED_PROJECT_REF && process.env.SEED_PROJECT_REF !== STAGING_REF) {
    console.error(`Refusing: this script only writes to staging (${STAGING_REF}).`);
    process.exit(2);
  }
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  const grantEmails = (opt('grant') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const sql = buildSeedSql(doc, { grantEmails });
  const out = opt('sql-out');
  if (out) writeFileSync(out, sql);
  if (!argv.includes('--apply')) {
    if (!out) process.stdout.write(sql);
    return;
  }
  const result = await runOnStaging(sql);
  const row = Array.isArray(result) ? result[result.length - 1] : result;
  console.log(`Staging: playbook "${doc.playbook.id}" has ${row?.concepts} concepts; access: ${JSON.stringify(row?.granted)}`);
  const missing = grantEmails.filter((e) => !(row?.granted ?? []).includes(e.toLowerCase()));
  if (missing.length) console.log(`No staging account for: ${missing.join(', ')}`);
}

if (process.argv[1] && process.argv[1].endsWith('seed-playbook.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
