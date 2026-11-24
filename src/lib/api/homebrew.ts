/**
 * lib/api/homebrew.ts — working homebrew folder, library repo, and index reconciliation.
 *
 * Deploy, add, and remove report per folder; HTTP 502 responses carrying partial
 * per-folder results still resolve so callers can display every folder's outcome.
 */
import { fetchOk, getJson, postJson, putJson, rpc } from './transport';
import { getDataSource } from '$lib/services/datasource';
import {
  validateDocument,
  type DocumentValidation,
} from '$lib/services/validate-service';
import type { SourceDisplay } from '$lib/data/source.ts';
import {
  resolveSources as resolveInWebview,
  type SourceDisplays,
} from '$lib/services/source-display';
import {
  deployAllFromHomebrew,
  deployFromHomebrew,
  readHomebrewText as readTextInWebview,
  saveHomebrewText,
  type DeployAllResult,
  type DeployResult,
} from '$lib/services/homebrew-deploy';
import {
  addToLiveFolders,
  listLibrary,
  readLibraryFile,
  retireFromLiveFolders,
  type LibraryEntry,
  type LibraryListing,
  type LibraryResult,
} from '$lib/services/homebrew-library';
import {
  checkIndex,
  listHomebrewFiles as listInWebview,
  resolveMismatch,
  type HomebrewFiles,
  type IndexMismatch,
  type MismatchAction,
} from '$lib/services/homebrew-index';

export type {
  SourceDisplay,
  SourceDisplays,
  HomebrewFiles,
  DeployAllResult,
  DeployResult,
  LibraryEntry,
  LibraryListing,
  LibraryResult,
  IndexMismatch,
  MismatchAction,
};

export interface HomebrewScan {
  file: string;
  totals: DocumentValidation['totals'];
  types: DocumentValidation['types'];
}

const fileUrl = (file: string) =>
  `/api/homebrew/files/${encodeURIComponent(file)}`;

async function requestPerFolder<T>(
  url: string,
  init: RequestInit,
  resultKey: 'copied' | 'done' | 'errors',
): Promise<T> {
  const res = await fetch(url, init);
  const reply = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (res.ok || Array.isArray(reply?.[resultKey])) return reply as T;
  throw new Error(
    (reply?.message as string | undefined) ?? `HTTP ${res.status} from ${url}`,
  );
}

const postPerFolder = <T>(
  url: string,
  body: unknown,
  resultKey: 'copied' | 'done' | 'errors',
) =>
  requestPerFolder<T>(
    url,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    resultKey,
  );

export const listHomebrewFiles = (): Promise<HomebrewFiles> =>
  rpc(listInWebview, () => getJson<HomebrewFiles>('/api/homebrew'));

export const resolveSources = (ids: string[]): Promise<SourceDisplays> =>
  rpc(
    () => resolveInWebview(ids),
    () => postJson('/api/source-display', { ids }),
  );

export const readHomebrewFile = (
  file: string,
): Promise<Record<string, unknown>> =>
  rpc(
    () => getDataSource().readHomebrew(file),
    () => getJson(fileUrl(file)),
  );

export const readHomebrewText = (file: string): Promise<string> =>
  rpc(
    () => readTextInWebview(file),
    async () => (await fetchOk(`${fileUrl(file)}?format=raw`)).text(),
  );

export const saveHomebrewFile = (
  file: string,
  text: string,
): Promise<{ path: string }> =>
  rpc(
    () => saveHomebrewText(file, text),
    () => putJson(fileUrl(file), { text }),
  );

export const scanHomebrewFile = (file: string): Promise<HomebrewScan> =>
  rpc(
    async () => {
      const { totals, types } = await validateDocument(
        await getDataSource().readHomebrew(file),
      );
      return { file, totals, types };
    },
    () => postJson(`${fileUrl(file)}/validate`, {}),
  );

export const deployHomebrew = (file: string): Promise<DeployResult> =>
  rpc(
    () => deployFromHomebrew(file),
    () => postPerFolder('/api/homebrew/deploy', { file }, 'copied'),
  );

export const deployAllHomebrew = (): Promise<DeployAllResult> =>
  rpc(deployAllFromHomebrew, () =>
    postPerFolder('/api/homebrew/deploy', { all: true }, 'errors'),
  );

export const listHomebrewLibrary = (): Promise<LibraryListing> =>
  rpc(listLibrary, () => getJson('/api/homebrew/library'));

export const readHomebrewLibraryFile = (
  folder: string,
  file: string,
): Promise<Record<string, unknown>> =>
  rpc(
    () => readLibraryFile(folder, file),
    () =>
      getJson(
        `/api/homebrew/library?folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(file)}`,
      ),
  );

export const addHomebrewFromRepo = (
  folder: string,
  file: string,
): Promise<LibraryResult> =>
  rpc(
    () => addToLiveFolders(folder, file),
    () =>
      postPerFolder(
        '/api/homebrew/library',
        { action: 'add', folder, file },
        'done',
      ),
  );

export const retireHomebrew = (file: string): Promise<LibraryResult> =>
  rpc(
    () => retireFromLiveFolders(file),
    () => requestPerFolder(fileUrl(file), { method: 'DELETE' }, 'done'),
  );

export const getIndexMismatch = (): Promise<IndexMismatch> =>
  rpc(checkIndex, () => getJson('/api/homebrew/index'));

export const resolveIndexMismatch = (
  action: MismatchAction,
  file: string,
): Promise<void> =>
  rpc(
    () => resolveMismatch(action, file),
    async () => {
      await postJson('/api/homebrew/index', { action, file });
    },
  );
