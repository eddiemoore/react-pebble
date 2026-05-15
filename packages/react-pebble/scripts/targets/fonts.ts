/**
 * scripts/targets/fonts.ts — Shared FontKey type for all Targets.
 *
 * Each Adapter (piu, rocky, c) owns its own `Record<FontKey, string>` mapping
 * to its native font naming. The FontKey union forces lockstep coverage at
 * compile time: adding a font here without updating all three Adapters fails
 * tsc with "missing properties".
 *
 * Rationale for keeping three tables instead of one combined registry:
 *   docs/adr/0001-target-adapter-seam.md — Locality wins over deduplication.
 */

export type FontKey =
  | 'gothic14'
  | 'gothic14Bold'
  | 'gothic18'
  | 'gothic18Bold'
  | 'gothic24'
  | 'gothic24Bold'
  | 'gothic28'
  | 'gothic28Bold'
  | 'bitham30Black'
  | 'bitham42Bold'
  | 'bitham42Light'
  | 'bitham34MediumNumbers'
  | 'bitham42MediumNumbers'
  | 'robotoCondensed21'
  | 'roboto21'
  | 'droid28'
  | 'leco20'
  | 'leco26'
  | 'leco28'
  | 'leco32'
  | 'leco36'
  | 'leco38'
  | 'leco42';

/** Runtime list of all FontKeys — handy for adapters that want to iterate. */
export const FONT_KEYS: readonly FontKey[] = [
  'gothic14', 'gothic14Bold', 'gothic18', 'gothic18Bold',
  'gothic24', 'gothic24Bold', 'gothic28', 'gothic28Bold',
  'bitham30Black', 'bitham42Bold', 'bitham42Light',
  'bitham34MediumNumbers', 'bitham42MediumNumbers',
  'robotoCondensed21', 'roboto21', 'droid28',
  'leco20', 'leco26', 'leco28', 'leco32', 'leco36', 'leco38', 'leco42',
] as const;
