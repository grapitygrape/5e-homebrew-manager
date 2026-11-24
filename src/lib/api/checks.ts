import { getJson, postJson, rpc } from './transport';
import {
  validateDocument,
  type DocumentValidation,
} from '$lib/services/validate-service';
import {
  checkSubmission,
  getCollisionReport,
  type FileCheck,
} from '$lib/services/brew-check-service';
import {
  entityAt,
  resolvePreview,
  type ResolvedPreview,
} from '$lib/services/preview-service';
import type { CollisionReport } from '$lib/engine/audit';

export type { DocumentValidation, FileCheck, ResolvedPreview };

export const validateFile = (
  doc: Record<string, unknown>,
): Promise<DocumentValidation> =>
  rpc(
    () => validateDocument(doc),
    () => postJson('/api/validate', doc),
  );

export const lintFile = (file: string): Promise<FileCheck> =>
  rpc(
    () => checkSubmission(file),
    () => getJson(`/api/lint?file=${encodeURIComponent(file)}`),
  );

export const lintText = (file: string, raw: string): Promise<FileCheck> =>
  rpc(
    () => {
      if (!raw) return checkSubmission(file || 'Untitled.json');
      let doc: Record<string, unknown>;
      try {
        doc = JSON.parse(raw);
      } catch (e) {
        throw new Error(`raw is not valid JSON: ${(e as Error).message}`);
      }
      return checkSubmission(file || 'Untitled.json', doc, raw);
    },
    () => postJson('/api/lint', { file, raw }),
  );

export const resolveEntity = (opts: {
  type: string;
  entityIdx: number;
  doc: Record<string, unknown>;
  file?: string;
}): Promise<ResolvedPreview> =>
  rpc(
    () => {
      const entity = entityAt(opts.doc, opts.type, opts.entityIdx);
      if (!entity)
        throw new Error(`No ${opts.type} at index ${opts.entityIdx}`);
      return resolvePreview({ ...opts, entity });
    },
    () => postJson('/api/resolve', opts),
  );

export const getCollisions = (refresh = false): Promise<CollisionReport> =>
  rpc(
    () => getCollisionReport(refresh),
    () => getJson(`/api/collisions${refresh ? '?refresh=1' : ''}`),
  );
