import {
  RUNTIME_STATE_KEY,
  USER_SETTINGS_KEY,
} from '@/lib/constants';
import {
  DEFAULT_RUNTIME_STATE,
  DEFAULT_USER_SETTINGS,
  type RuntimeState,
  type UserSettings,
} from '@/lib/types';

export async function getSettings(): Promise<UserSettings> {
  const result = await browser.storage.local.get(USER_SETTINGS_KEY);
  return {
    ...DEFAULT_USER_SETTINGS,
    ...(result[USER_SETTINGS_KEY] as Partial<UserSettings> | undefined),
  };
}

export async function saveSettings(
  partial: Partial<UserSettings>,
): Promise<UserSettings> {
  const next = {
    ...(await getSettings()),
    ...partial,
  };
  await browser.storage.local.set({
    [USER_SETTINGS_KEY]: next,
  });
  return next;
}

export async function getRuntimeState(): Promise<RuntimeState> {
  const result = await browser.storage.local.get(RUNTIME_STATE_KEY);
  return {
    ...DEFAULT_RUNTIME_STATE,
    ...(result[RUNTIME_STATE_KEY] as Partial<RuntimeState> | undefined),
  };
}

export async function updateRuntimeState(
  updater:
    | Partial<RuntimeState>
    | ((current: RuntimeState) => RuntimeState | Promise<RuntimeState>),
): Promise<RuntimeState> {
  const current = await getRuntimeState();
  const next =
    typeof updater === 'function'
      ? await updater(current)
      : { ...current, ...updater };

  await browser.storage.local.set({
    [RUNTIME_STATE_KEY]: next,
  });

  return next;
}

export async function bumpLibraryRevision(
  patch: Partial<RuntimeState> = {},
): Promise<RuntimeState> {
  return updateRuntimeState((current) => ({
    ...current,
    ...patch,
    libraryRevision: current.libraryRevision + 1,
  }));
}

export async function bumpCacheRevision(): Promise<RuntimeState> {
  return updateRuntimeState((current) => ({
    ...current,
    cacheRevision: current.cacheRevision + 1,
  }));
}

export async function bumpSettingsRevision(): Promise<RuntimeState> {
  return updateRuntimeState((current) => ({
    ...current,
    settingsRevision: current.settingsRevision + 1,
  }));
}
