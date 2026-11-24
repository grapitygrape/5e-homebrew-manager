/**
 * lib/prompt-client.ts — gather workspace paths, scan + lint, and copy AI fix
 * or convert prompts (engine/audit/fix-prompt.ts & convert-prompt.ts) to the
 * clipboard.
 *
 * Shared by the Files cards and the Parser. The calls go through lib/api, so
 * they run in the desktop webview or against the dev server alike. Folder
 * paths come from Settings, resolved to absolute, so a model with file access
 * can open the guides directly; Settings failing only drops the paths.
 */
import {
  getCapabilities,
  getSettings,
  lintFile,
  lintText,
  readHomebrewFile,
  validateFile,
  type SettingsStatus,
} from '$lib/api';
import {
  buildConvertPrompt,
  buildFixPrompt,
  type ConvertPromptPaths,
  type FixPrompt,
} from '$lib/engine/audit';
import { getReposOverview, isTauri } from '$lib/tauri-bridge';

export interface FixPromptSource {
  file: string;
  /** Parsed document; read from the homebrew folder when omitted. */
  doc?: Record<string, unknown>;
  /** Editor text, so lint sees unsaved changes. */
  raw?: string;
  /** True when `file` is in the homebrew folder, so its path is known. */
  inHomebrew?: boolean;
}

export interface ConvertPromptSource {
  /** The text to convert. */
  source: string;
  file: string;
  /** True when `file` is in the homebrew folder, so its path is known. */
  inHomebrew: boolean;
  doc: Record<string, unknown> | null;
}

/** The schema version is a nice-to-have; the desktop shell or hm-backend knows it. */
export async function utilsVersion(): Promise<string | null> {
  if (!isTauri()) {
    const caps = await getCapabilities().catch(() => null);
    if (!caps?.repos) return null;
  }
  try {
    return (await getReposOverview()).schemaSync.actualUtilsVersion;
  } catch {
    return null;
  }
}

type Status = SettingsStatus[keyof SettingsStatus];
const where = (s: Status): string | undefined =>
  s.kind === 'path'
    ? (s.resolved ?? s.value)
    : s.kind === 'url'
      ? s.value
      : undefined;

/** The configured folders, absolute; empty when Settings can't be read. */
export async function folderPaths(): Promise<ConvertPromptPaths> {
  try {
    const { status } = await getSettings();
    return {
      guides: where(status.guides),
      data: where(status.data),
      homebrew: where(status.homebrew),
      schema: where(status.schema),
    };
  } catch {
    return {};
  }
}

/** Where a homebrew-folder file lives on disk, when the folder is known. */
export function homebrewPath(
  paths: ConvertPromptPaths,
  file: string,
): string | undefined {
  const homebrew = paths.homebrew?.replace(/[\\/]+$/, '');
  return homebrew ? `${homebrew}/${file}` : undefined;
}

export async function makeFixPrompt(src: FixPromptSource): Promise<FixPrompt> {
  const fromDisk = !src.doc;
  const doc = src.doc ?? (await readHomebrewFile(src.file));
  const [validation, check, schemaVersion, paths] = await Promise.all([
    validateFile(doc),
    (src.raw !== undefined ? lintText(src.file, src.raw) : lintFile(src.file))
      // Lint adds file-level problems; the entity problems stand without it.
      .catch(() => null),
    utilsVersion(),
    folderPaths(),
  ]);
  return buildFixPrompt({
    file: src.file,
    filePath:
      fromDisk || src.inHomebrew ? homebrewPath(paths, src.file) : undefined,
    doc,
    issues: validation.issues,
    lint: check?.lint.issues,
    collisions: check?.collisions,
    guidesPath: paths.guides,
    schemaVersion,
  });
}

/** Build the fix prompt and copy it. Resolves with the prompt for the status line. */
export async function copyFixPrompt(src: FixPromptSource): Promise<FixPrompt> {
  const prompt = await makeFixPrompt(src);
  if (prompt.problems) await navigator.clipboard.writeText(prompt.text);
  return prompt;
}

/** Build the convert prompt and copy it. Resolves with the prompt text. */
export async function copyConvertPrompt(
  src: ConvertPromptSource,
): Promise<string> {
  const [paths, schemaVersion] = await Promise.all([
    folderPaths(),
    utilsVersion(),
  ]);
  const text = buildConvertPrompt({
    source: src.source,
    file: src.file,
    filePath: src.inHomebrew ? homebrewPath(paths, src.file) : undefined,
    doc: src.doc,
    paths,
    schemaVersion,
  });
  await navigator.clipboard.writeText(text);
  return text;
}
