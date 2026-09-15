import type { NammuApp } from '@nammu/sdk';

export interface TelegramAccountTab {
  id: string;
  name: string;
  color: string;
  unreadCount: number;
  isMuted: boolean;
  url: string;
}

export const TELEGRAM_TABS_KEY = 'nammu_telegram_tabs';
export const MAX_TELEGRAM_ACCOUNTS = 8;
export const TELEGRAM_WEB_URL = 'https://web.telegram.org/a/';

const DEFAULT_TAB: TelegramAccountTab = {
  id: 'telegram-account-1',
  name: 'Personal Account',
  color: '#2aabee',
  unreadCount: 0,
  isMuted: false,
  url: TELEGRAM_WEB_URL,
};

function isAccountTab(value: unknown): value is TelegramAccountTab {
  if (!value || typeof value !== 'object') return false;
  const tab = value as Partial<TelegramAccountTab>;
  return (
    typeof tab.id === 'string' &&
    /^telegram-account-[a-z0-9-]+$/.test(tab.id) &&
    typeof tab.name === 'string' &&
    tab.name.trim().length > 0 &&
    tab.name.length <= 48 &&
    typeof tab.color === 'string' &&
    /^#[a-f0-9]{6}$/i.test(tab.color) &&
    typeof tab.unreadCount === 'number' &&
    Number.isFinite(tab.unreadCount) &&
    tab.unreadCount >= 0 &&
    typeof tab.isMuted === 'boolean' &&
    typeof tab.url === 'string'
  );
}

export function normalizeTelegramTabs(value: unknown): TelegramAccountTab[] {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [{ ...DEFAULT_TAB }];
    }
  }
  if (!Array.isArray(parsed)) return [{ ...DEFAULT_TAB }];
  const seen = new Set<string>();
  const tabs = parsed.filter((entry): entry is TelegramAccountTab => {
    if (!isAccountTab(entry) || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  }).slice(0, MAX_TELEGRAM_ACCOUNTS);
  return tabs.length ? tabs.map((tab) => ({ ...tab })) : [{ ...DEFAULT_TAB }];
}

export async function initializeTelegramStorage(app: NammuApp): Promise<TelegramAccountTab[]> {
  const settings = await app.settings.getAll();
  const existing = settings[TELEGRAM_TABS_KEY];
  const legacy = await app.migration.readLegacyStorage(TELEGRAM_TABS_KEY);

  if (legacy !== null) {
    const tabs = normalizeTelegramTabs(legacy);
    // Authenticated profiles are adopted before metadata migration is marked
    // complete. A crash can safely replay every operation.
    for (const tab of tabs) {
      await app.migration.adoptIntegrationProfile({
        migrationId: 'telegram-core-v1',
        legacyProfileId: tab.id,
        partitionKey: tab.id,
      });
    }
    await app.settings.set(TELEGRAM_TABS_KEY, JSON.stringify(tabs));
    await app.migration.completeLegacyStorage(TELEGRAM_TABS_KEY);
    return tabs;
  }

  const tabs = normalizeTelegramTabs(existing);
  if (existing === undefined) {
    await app.settings.set(TELEGRAM_TABS_KEY, JSON.stringify(tabs));
  }
  return tabs;
}

let saveQueue = Promise.resolve();
export function saveTelegramTabs(app: NammuApp, tabs: TelegramAccountTab[]): Promise<void> {
  const normalized = normalizeTelegramTabs(tabs);
  saveQueue = saveQueue.then(async () => {
    await app.settings.set(TELEGRAM_TABS_KEY, JSON.stringify(normalized));
  });
  return saveQueue;
}
