import type { Concept } from './types';
import type { Playbook } from './usePlaybooks';
import { gameThemeKey, type GameTheme } from './gameThemeTypes';

/**
 * A game's picked themes matched to the playbooks this account can read now.
 * A theme whose playbook or concept is not there (access withdrawn, concept
 * removed or invalid) resolves without a concept: shown as unavailable,
 * skipped by the presentation, never a crash. While the playbooks are still
 * loading for the first time, `pending` is true and nothing is unavailable yet.
 */
export interface ResolvedGameTheme {
  key: string;
  theme: GameTheme;
  concept: Concept | null;
  playbook: Playbook | null;
}

export function resolveGameThemes(themes: readonly GameTheme[], playbooks: readonly Playbook[]): ResolvedGameTheme[] {
  return themes.map((theme) => {
    const playbook = playbooks.find((p) => p.id === theme.playbookId) ?? null;
    const concept = playbook?.concepts.find((c) => c.id === theme.conceptId) ?? null;
    return { key: gameThemeKey(theme), theme, concept, playbook: concept ? playbook : null };
  });
}

/** The concepts that can be shown, in pick order. */
export function availableConcepts(resolved: readonly ResolvedGameTheme[]): Concept[] {
  return resolved.flatMap((r) => (r.concept ? [r.concept] : []));
}
