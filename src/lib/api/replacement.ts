import { getJson, postJson, putJson, rpc } from './transport';
import * as supersessions from '$lib/services/supersession-service';
import type {
  LoadedSupersessions,
  ReplacementViewInfo,
} from '$lib/services/supersession-service';
import { parseOverrideRules } from '$lib/engine/supersession';
import type {
  Duplicate,
  OverrideTarget,
  ReviewItem,
  ScanResult,
  SupersessionRow,
} from '$lib/engine/supersession';

export type { LoadedSupersessions, ReplacementViewInfo };

export type NamedOverrideTarget = OverrideTarget & { full: string };

export interface SupersessionSave {
  rows: SupersessionRow[];
  review: ReviewItem[];
  envelope: Record<string, unknown>;
  overrides: unknown;
}

export const getReplacementViewInfo = (): Promise<ReplacementViewInfo> =>
  rpc(supersessions.replacementViewInfo, () =>
    getJson<ReplacementViewInfo>('/api/replacement/info'),
  );

export const getSupersessions = (): Promise<LoadedSupersessions> =>
  rpc(supersessions.loadSupersessions, () =>
    getJson<LoadedSupersessions>('/api/replacement'),
  );

export const saveSupersessions = (
  input: SupersessionSave,
): Promise<{ count: number; warnings: string[] }> =>
  rpc(
    () =>
      supersessions.saveSupersessions({
        ...input,
        overrides: parseOverrideRules(input.overrides),
      }),
    () => putJson('/api/replacement', input),
  );

export const deploySupersessions = (): Promise<{ from: string; to: string }> =>
  rpc(supersessions.deploySupersessions, () =>
    postJson('/api/replacement/deploy', {}),
  );

export const scanReplacementMarkers = (): Promise<
  ScanResult & { fileCount: number; duplicates: Duplicate[] }
> => rpc(supersessions.scanAllMarkers, () => getJson('/api/replacement/scan'));

export const getOverrideTargets = (
  source: string,
  prop: string,
): Promise<NamedOverrideTarget[]> =>
  rpc(
    () => supersessions.namedOverrideTargets(prop, source),
    async () =>
      (
        await getJson<{ targets: NamedOverrideTarget[] }>(
          `/api/replacement/override-matches?source=${encodeURIComponent(source)}&prop=${encodeURIComponent(prop)}`,
        )
      ).targets,
  );
