import logger from '@/utils/logger';
import { getErrorMessage, isNetworkLikeMessage } from '@/utils/transientErrors';

/**
 * Club codes: a coach types the code their club gave them and the server
 * (redeem_playbook_code, migration 067) grants this account the club's
 * playbook. The server stores only a hash of each code and limits failed
 * attempts; the app only normalises, calls and maps the answer to a reason
 * the sheet can explain. Nothing from the server is shown as such.
 */

/** Why a code did not open anything (each has its own message in the sheet). */
export type RedeemCodeError = 'invalid' | 'expired' | 'used_up' | 'revoked' | 'rate_limited' | 'offline' | 'failed';

export type RedeemCodeResult =
  | { ok: true; playbookId: string; playbookName: string; already: boolean }
  | { ok: false; error: RedeemCodeError };

const SERVER_ERRORS: ReadonlySet<string> = new Set(['invalid', 'expired', 'used_up', 'revoked', 'rate_limited']);

/** Shortest / longest code worth sending (normalised). */
export const MIN_CODE_LENGTH = 4;
export const MAX_CODE_LENGTH = 40;

/** What the input shows: upper-case, letters, digits and dashes only. */
export function formatCodeInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, MAX_CODE_LENGTH + 8);
}

/** What is sent: upper-case letters and digits only (dashes and spaces do not matter). */
export function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isCodeComplete(raw: string): boolean {
  const n = normaliseCode(raw).length;
  return n >= MIN_CODE_LENGTH && n <= MAX_CODE_LENGTH;
}

function parseAnswer(data: unknown): RedeemCodeResult {
  if (typeof data !== 'object' || data === null) return { ok: false, error: 'failed' };
  const d = data as Record<string, unknown>;
  if (d.ok === true && typeof d.playbook_id === 'string') {
    return {
      ok: true,
      playbookId: d.playbook_id,
      playbookName: typeof d.playbook_name === 'string' ? d.playbook_name : '',
      already: d.already === true,
    };
  }
  if (d.ok === false && typeof d.error === 'string' && SERVER_ERRORS.has(d.error)) {
    return { ok: false, error: d.error as RedeemCodeError };
  }
  return { ok: false, error: 'failed' };
}

/**
 * Redeems a code for the signed-in user `userId`. Never throws: every failure
 * is one of RedeemCodeError ('offline' when the request could not reach the
 * server, 'failed' for anything unexpected).
 */
export async function redeemPlaybookCode(raw: string, userId: string): Promise<RedeemCodeResult> {
  const code = normaliseCode(raw);
  if (code.length < MIN_CODE_LENGTH || code.length > MAX_CODE_LENGTH) return { ok: false, error: 'invalid' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, error: 'offline' };
  try {
    const { getSupabaseClient } = await import('@/datastore/supabase/client');
    const client = getSupabaseClient();
    // Without this user's session the call would run as someone else / anon.
    const { data: sessionData } = await client.auth.getSession();
    if (sessionData.session?.user.id !== userId) {
      logger.warn('[Playbook] Code not redeemed: no session for the signed-in user');
      return { ok: false, error: 'failed' };
    }
    const { data, error } = await client.rpc('redeem_playbook_code', { p_code: code });
    if (error) {
      const message = getErrorMessage(error);
      if (isNetworkLikeMessage(message)) return { ok: false, error: 'offline' };
      logger.warn('[Playbook] Code redeem failed', message);
      return { ok: false, error: 'failed' };
    }
    const result = parseAnswer(data);
    if (!result.ok && result.error === 'failed') logger.warn('[Playbook] Unexpected code redeem answer');
    return result;
  } catch (error) {
    const message = getErrorMessage(error);
    if (isNetworkLikeMessage(message)) return { ok: false, error: 'offline' };
    logger.warn('[Playbook] Code redeem failed', message);
    return { ok: false, error: 'failed' };
  }
}
