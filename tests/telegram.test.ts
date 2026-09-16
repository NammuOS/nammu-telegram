import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NammuApp } from '@nammu/sdk';
import {
  MAX_TELEGRAM_ACCOUNTS,
  TELEGRAM_TABS_KEY,
  initializeTelegramStorage,
  normalizeTelegramTabs,
} from '../src/telegram/telegramStore';

const root = resolve(import.meta.dir, '..');

describe('Nammu Telegram package', () => {
  it('sanitizes, deduplicates and bounds account metadata', () => {
    const tabs = Array.from({ length: 10 }, (_, index) => ({
      id: `telegram-account-${index + 1}`,
      name: `Account ${index + 1}`,
      color: '#2aabee',
      unreadCount: 0,
      isMuted: index % 2 === 0,
      url: 'https://web.telegram.org/a/',
    }));
    expect(normalizeTelegramTabs([...tabs, tabs[0]])).toHaveLength(MAX_TELEGRAM_ACCOUNTS);
    expect(normalizeTelegramTabs('corrupt')).toMatchObject([{ id: 'telegram-account-1' }]);
  });

  it('adopts authenticated profiles before completing legacy metadata migration', async () => {
    const order: string[] = [];
    const legacy = JSON.stringify([
      { id: 'telegram-account-a', name: 'A', color: '#2aabee', unreadCount: 0, isMuted: false, url: 'https://web.telegram.org/a/' },
      { id: 'telegram-account-b', name: 'B', color: '#64b5f6', unreadCount: 0, isMuted: true, url: 'https://web.telegram.org/a/' },
    ]);
    const app = {
      settings: {
        getAll: async () => ({}),
        set: async (key: string) => { order.push(`set:${key}`); return { success: true }; },
      },
      migration: {
        readLegacyStorage: async () => legacy,
        discoverIntegrationProfiles: async () => ({ profileIds: [] }),
        adoptIntegrationProfile: async ({ partitionKey }: { partitionKey: string }) => {
          order.push(`adopt:${partitionKey}`);
          return { status: 'adopted' as const };
        },
        completeLegacyStorage: async (key: string) => { order.push(`complete:${key}`); return { completed: true }; },
      },
    } as unknown as NammuApp;
    const tabs = await initializeTelegramStorage(app);
    expect(tabs.map((tab) => tab.id)).toEqual(['telegram-account-a', 'telegram-account-b']);
    expect(order).toEqual([
      'adopt:telegram-account-a',
      'adopt:telegram-account-b',
      `set:${TELEGRAM_TABS_KEY}`,
      `complete:${TELEGRAM_TABS_KEY}`,
    ]);
  });

  it('does not request profile adoption after migration is complete', async () => {
    let adoptionCalls = 0;
    const stored = JSON.stringify([{ id: 'telegram-account-1', name: 'Personal', color: '#2aabee', unreadCount: 0, isMuted: false, url: 'https://web.telegram.org/a/' }]);
    const app = {
      settings: { getAll: async () => ({ [TELEGRAM_TABS_KEY]: stored }) },
      migration: {
        readLegacyStorage: async () => null,
        discoverIntegrationProfiles: async () => ({ profileIds: ['telegram-account-1'] }),
        adoptIntegrationProfile: async () => { adoptionCalls += 1; return { status: 'adopted' as const }; },
      },
    } as unknown as NammuApp;
    await initializeTelegramStorage(app);
    expect(adoptionCalls).toBe(0);
  });

  it('recovers package tabs from approved profile identities when legacy metadata is incomplete', async () => {
    const adopted: string[] = [];
    let saved = '';
    const app = {
      settings: {
        getAll: async () => ({
          [TELEGRAM_TABS_KEY]: JSON.stringify([
            { id: 'telegram-account-1', name: 'Personal', color: '#2aabee', unreadCount: 0, isMuted: false, url: 'https://web.telegram.org/a/' },
          ]),
        }),
        set: async (_key: string, value: string) => { saved = value; return { success: true }; },
      },
      migration: {
        readLegacyStorage: async () => null,
        discoverIntegrationProfiles: async () => ({
          profileIds: ['telegram-account-1', 'telegram-account-a', 'telegram-account-b'],
        }),
        adoptIntegrationProfile: async ({ partitionKey }: { partitionKey: string }) => {
          adopted.push(partitionKey);
          return { status: 'adopted' as const };
        },
      },
    } as unknown as NammuApp;
    const tabs = await initializeTelegramStorage(app);
    expect(tabs.map((tab) => tab.id)).toEqual([
      'telegram-account-1',
      'telegram-account-a',
      'telegram-account-b',
    ]);
    expect(adopted).toEqual(tabs.map((tab) => tab.id));
    expect(JSON.parse(saved)).toHaveLength(3);
  });

  it('uses only the SDK surface boundary and declares the narrow T0 contract', () => {
    const app = readFileSync(resolve(root, 'src/telegram/TelegramApp.tsx'), 'utf8');
    const surface = readFileSync(resolve(root, 'src/host/WebSurface.tsx'), 'utf8');
    const manifest = JSON.parse(readFileSync(resolve(root, 'nammu.app.json'), 'utf8'));
    expect(surface).toContain("capability: 'telegram-web'");
    expect(surface).toContain("profileKey: 'telegram'");
    expect(surface).toContain('partitionKey');
    expect(surface).toContain("message.includes('Gecko integration session is not ready')");
    expect(surface).toContain('attempts < 40');
    expect(surface).toContain("host.dataset.surfaceReady = 'true'");
    expect(manifest.capabilities[0]).toMatchObject({ maxSurfaces: 8, maxPartitions: 8, persistentProfile: true });
    expect(manifest.capabilities[0].navigation.mode).toBe('approved-origins');
    expect(manifest.permissions).toEqual([
      'integration.web-surfaces',
      'migration.legacy-storage',
      'migration.integration-profile',
    ]);
    for (const source of [app, surface]) {
      expect(source).not.toMatch(/getPlatformCapabilities|geckoEvalChrome|ContextualIdentityService|__TAURI__|src-tauri|web_surface\.rs/);
    }
  });

  it('keeps only the selected Telegram account live', () => {
    const app = readFileSync(resolve(root, 'src/telegram/TelegramApp.tsx'), 'utf8');
    expect(app).toContain('{activeTab && (');
    expect(app).toContain('partitionKey={activeTab.id}');
    expect(app).toContain('key={`${attempt}-${activeTab.id}`}');
    expect(app).not.toContain('{tabs.map((tab) => (\n          <TelegramSurface');
  });
});
