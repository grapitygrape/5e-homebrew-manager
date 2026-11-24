/** lib/api/setup.ts — the setup screen's draft and save (desktop & web/container). */
import { getJson, postJson, rpc } from './transport';
import {
  completeSetup,
  setupCompleted,
  setupDraft,
  type SetupDraft,
} from '$lib/services/setup-service';

export type { SetupDraft };

export const getSetupDraft = (): Promise<SetupDraft> =>
  rpc(
    () => setupDraft(),
    async () => (await getJson<{ draft: SetupDraft }>('/api/setup')).draft,
  );

/** Whether setup has been finished once. */
export const isSetupCompleted = (): Promise<boolean> =>
  rpc(
    () => setupCompleted(),
    async () => (await getJson<{ completed: boolean }>('/api/setup')).completed,
  );

export const finishSetup = (draft: SetupDraft): Promise<void> =>
  rpc(
    () => completeSetup(draft),
    async () => {
      await postJson('/api/setup', { draft });
    },
  );
