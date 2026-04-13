import type { OptionsState, RuntimeMessage } from '@/lib/types';

export function initializeControlPanel() {
  const form = document.querySelector<HTMLFormElement>('#settings-form');
  const apiKeyInput = document.querySelector<HTMLInputElement>('#api-key');
  const enabledInput = document.querySelector<HTMLInputElement>('#enabled');
  const thresholdInput = document.querySelector<HTMLInputElement>('#threshold');
  const thresholdValue = document.querySelector<HTMLOutputElement>('#threshold-value');
  const statusElement = document.querySelector<HTMLElement>('#status');
  const mutedCountElement = document.querySelector<HTMLElement>('#muted-count');
  const cacheCountElement = document.querySelector<HTMLElement>('#cache-count');
  const saveButton = document.querySelector<HTMLButtonElement>('#save-button');
  const undoButton = document.querySelector<HTMLButtonElement>('#undo-button');
  const resetButton = document.querySelector<HTMLButtonElement>('#reset-button');
  const clearCacheButton =
    document.querySelector<HTMLButtonElement>('#clear-cache-button');

  void loadOptionsState();

  thresholdInput?.addEventListener('input', () => {
    if (!thresholdInput || !thresholdValue) {
      return;
    }

    thresholdValue.value = Number(thresholdInput.value).toFixed(2);
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!apiKeyInput || !enabledInput || !thresholdInput) {
      return;
    }

    setBusy(saveButton, true);
    setStatus('Saving settings...', 'info');

    try {
      const state = await sendBackgroundMessage<OptionsState>({
        type: 'OPTIONS_VALIDATE_AND_SAVE_SETTINGS',
        settings: {
          apiKey: apiKeyInput.value,
          enabled: enabledInput.checked,
          threshold: Number(thresholdInput.value),
        },
      });

      renderOptionsState(state);
      setStatus('Settings saved.', 'success');
    } catch (error) {
      setStatus(formatError(error), 'error');
    } finally {
      setBusy(saveButton, false);
    }
  });

  undoButton?.addEventListener('click', async () => {
    setBusy(undoButton, true);

    try {
      const response = await sendBackgroundMessage<{ ok: boolean; message: string }>({
        type: 'UNDO_LAST_MUTE',
      });
      await loadOptionsState();
      setStatus(response.message, response.ok ? 'success' : 'info');
    } catch (error) {
      setStatus(formatError(error), 'error');
    } finally {
      setBusy(undoButton, false);
    }
  });

  resetButton?.addEventListener('click', async () => {
    setBusy(resetButton, true);

    try {
      const state = await sendBackgroundMessage<OptionsState>({
        type: 'OPTIONS_RESET_MUTED_LIBRARY',
      });
      renderOptionsState(state);
      setStatus('Muted library cleared.', 'success');
    } catch (error) {
      setStatus(formatError(error), 'error');
    } finally {
      setBusy(resetButton, false);
    }
  });

  clearCacheButton?.addEventListener('click', async () => {
    setBusy(clearCacheButton, true);

    try {
      const state = await sendBackgroundMessage<OptionsState>({
        type: 'OPTIONS_CLEAR_SCAN_CACHE',
      });
      renderOptionsState(state);
      setStatus('Scan cache cleared.', 'success');
    } catch (error) {
      setStatus(formatError(error), 'error');
    } finally {
      setBusy(clearCacheButton, false);
    }
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    if (changes.userSettings || changes.runtimeState) {
      void loadOptionsState();
    }
  });

  async function loadOptionsState() {
    if (!statusElement) {
      return;
    }

    try {
      const state = await sendBackgroundMessage<OptionsState>({
        type: 'OPTIONS_GET_STATE',
      });
      renderOptionsState(state);
      setStatus('Ready.', 'info');
    } catch (error) {
      setStatus(formatError(error), 'error');
    }
  }

  function renderOptionsState(state: OptionsState) {
    assertOptionsState(state);

    if (
      !apiKeyInput ||
      !enabledInput ||
      !thresholdInput ||
      !thresholdValue ||
      !mutedCountElement ||
      !cacheCountElement ||
      !undoButton
    ) {
      return;
    }

    apiKeyInput.value = state.settings.apiKey;
    enabledInput.checked = state.settings.enabled;
    thresholdInput.value = state.settings.threshold.toFixed(2);
    thresholdValue.value = state.settings.threshold.toFixed(2);
    mutedCountElement.textContent = String(state.mutedCount);
    cacheCountElement.textContent = String(state.cacheCount);
    undoButton.disabled = !state.runtimeState.lastMutedImageId;
  }

  function setStatus(message: string, tone: 'info' | 'success' | 'error') {
    if (!statusElement) {
      return;
    }

    statusElement.textContent = message;
    statusElement.dataset.tone = tone;
  }
}

function setBusy(button: HTMLButtonElement | null, busy: boolean) {
  if (!button) {
    return;
  }

  button.disabled = busy;
  button.dataset.busy = String(busy);
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'The extension could not complete that request.';
}

async function sendBackgroundMessage<T>(message: RuntimeMessage): Promise<T> {
  const response = (await browser.runtime.sendMessage(message)) as
    | { ok: true; data: T }
    | { ok: false; error: string }
    | undefined;

  if (!response) {
    throw new Error('The extension background worker did not return a response.');
  }

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.data;
}

function assertOptionsState(value: unknown): asserts value is OptionsState {
  if (
    !value ||
    typeof value !== 'object' ||
    !('settings' in value) ||
    !('runtimeState' in value) ||
    !('mutedCount' in value) ||
    !('cacheCount' in value)
  ) {
    throw new Error('The background worker returned an invalid options state.');
  }
}
