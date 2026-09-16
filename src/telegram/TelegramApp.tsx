import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Edit2, Plus, RotateCw, Send, Volume2, VolumeX, X } from 'lucide-react';
import type { NammuApp, WebSurfaceSnapshot } from '@nammu/sdk';
import TelegramSurface, { type TelegramSurfaceHandle } from '../host/WebSurface';
import {
  MAX_TELEGRAM_ACCOUNTS,
  TELEGRAM_WEB_URL,
  saveTelegramTabs,
  type TelegramAccountTab,
} from './telegramStore';

const ACCOUNT_COLORS = ['#2aabee', '#64b5f6', '#8b5cf6', '#2dd4bf', '#f59e0b', '#f472b6'];

function accountId() {
  return `telegram-account-${crypto.randomUUID()}`;
}

interface Props {
  sdk: NammuApp;
  initialTabs: TelegramAccountTab[];
}

export default function TelegramApp({ sdk, initialTabs }: Props) {
  const [tabs, setTabs] = useState(initialTabs);
  const [activeTabId, setActiveTabId] = useState(initialTabs[0].id);
  const [editingTab, setEditingTab] = useState<TelegramAccountTab | null>(null);
  const [editingName, setEditingName] = useState('');
  const [attempt, setAttempt] = useState(1);
  const [failure, setFailure] = useState('');
  const surfaceRefs = useRef(new Map<string, TelegramSurfaceHandle>());
  const didMount = useRef(false);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    void saveTelegramTabs(sdk, tabs).catch((error) => {
      setFailure(error instanceof Error ? error.message : 'Telegram account settings could not be saved.');
    });
  }, [sdk, tabs]);

  const activate = (tab: TelegramAccountTab) => {
    setActiveTabId(tab.id);
    setFailure('');
    void surfaceRefs.current.get(tab.id)?.focus();
  };

  const addAccount = () => {
    if (tabs.length >= MAX_TELEGRAM_ACCOUNTS) return;
    const tab: TelegramAccountTab = {
      id: accountId(),
      name: `Account ${tabs.length + 1}`,
      color: ACCOUNT_COLORS[tabs.length % ACCOUNT_COLORS.length],
      unreadCount: 0,
      isMuted: false,
      url: TELEGRAM_WEB_URL,
    };
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
    setFailure('');
  };

  const closeAccount = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (tabs.length === 1) return;
    const index = tabs.findIndex((tab) => tab.id === id);
    const remaining = tabs.filter((tab) => tab.id !== id);
    if (activeTabId === id) {
      setActiveTabId(remaining[Math.min(index, remaining.length - 1)].id);
    }
    surfaceRefs.current.delete(id);
    setTabs(remaining);
  };

  const toggleMute = () => {
    if (!activeTab) return;
    const muted = !activeTab.isMuted;
    setTabs((current) =>
      current.map((tab) => tab.id === activeTab.id ? { ...tab, isMuted: muted } : tab),
    );
    void surfaceRefs.current.get(activeTab.id)?.setMuted(muted);
  };

  const saveName = () => {
    if (!editingTab) return;
    const name = editingName.trim().slice(0, 48);
    if (!name) return;
    setTabs((current) => current.map((tab) => tab.id === editingTab.id ? { ...tab, name } : tab));
    setEditingTab(null);
    setEditingName('');
  };

  return (
    <main className="telegram-app">
      <header className="telegram-tabs" role="tablist" aria-label="Telegram accounts">
        <div className="telegram-tab-list">
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={active}
                tabIndex={0}
                onClick={() => activate(tab)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') activate(tab);
                }}
                className={`telegram-tab ${active ? 'is-active' : ''}`}
              >
                <span className="telegram-tab-color" style={{ background: tab.color }} />
                <span className="telegram-tab-name">{tab.name}</span>
                {tab.isMuted && <VolumeX size={10} className="telegram-muted" />}
                <button
                  type="button"
                  className="telegram-tab-action"
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingTab(tab);
                    setEditingName(tab.name);
                  }}
                  title="Rename account"
                  aria-label={`Rename ${tab.name}`}
                >
                  <Edit2 size={10} />
                </button>
                {tabs.length > 1 && (
                  <button
                    type="button"
                    className="telegram-tab-action telegram-close-account"
                    onClick={(event) => closeAccount(tab.id, event)}
                    title="Close account"
                    aria-label={`Close ${tab.name}`}
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            className="telegram-icon-button telegram-add"
            onClick={addAccount}
            disabled={tabs.length >= MAX_TELEGRAM_ACCOUNTS}
            title={tabs.length >= MAX_TELEGRAM_ACCOUNTS ? 'Eight-account limit reached' : 'Add account'}
            aria-label="Add Telegram account"
          >
            <Plus size={12} />
          </button>
        </div>

        <div className="telegram-toolbar">
          <span className="telegram-brand"><Send size={10} /> Telegram</span>
          <button
            type="button"
            className="telegram-icon-button"
            onClick={() => activeTab && surfaceRefs.current.get(activeTab.id)?.reload()}
            title="Reload Telegram"
            aria-label="Reload Telegram"
          >
            <RotateCw size={12} />
          </button>
          <button
            type="button"
            className="telegram-icon-button"
            onClick={toggleMute}
            title={activeTab?.isMuted ? 'Unmute Telegram' : 'Mute Telegram'}
            aria-label={activeTab?.isMuted ? 'Unmute Telegram' : 'Mute Telegram'}
          >
            {activeTab?.isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>
        </div>
      </header>

      <section className="telegram-workspace">
        {activeTab && (
          <TelegramSurface
            key={`${attempt}-${activeTab.id}`}
            ref={(surface) => {
              if (surface) surfaceRefs.current.set(activeTab.id, surface);
              else surfaceRefs.current.delete(activeTab.id);
            }}
            sdk={sdk}
            partitionKey={activeTab.id}
            active
            muted={activeTab.isMuted}
            overlayActive={Boolean(editingTab)}
            url={activeTab.url}
            label={`Telegram · ${activeTab.name}`}
            onReady={() => {
              setFailure('');
            }}
            onState={(snapshot: WebSurfaceSnapshot) => {
              setTabs((current) => {
                const existing = current.find((entry) => entry.id === activeTab.id);
                if (!existing || existing.isMuted === snapshot.isMuted) return current;
                return current.map((entry) =>
                  entry.id === activeTab.id ? { ...entry, isMuted: snapshot.isMuted } : entry,
                );
              });
            }}
            onFailure={(message) => {
              setFailure(message || 'Telegram could not open.');
            }}
          />
        )}

        {failure && (
          <div className="telegram-error" role="alert">
            <div className="telegram-error-card">
              <AlertTriangle size={26} />
              <h2>Telegram could not open</h2>
              <p>{failure}</p>
              <button
                type="button"
                onClick={() => {
                  setFailure('');
                  surfaceRefs.current.clear();
                  setAttempt((current) => current + 1);
                }}
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </section>

      {editingTab && (
        <div className="telegram-dialog-layer">
          <form
            className="telegram-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              saveName();
            }}
          >
            <div className="telegram-dialog-title">
              <h2>Rename account</h2>
              <button type="button" onClick={() => setEditingTab(null)} aria-label="Close">
                <X size={14} />
              </button>
            </div>
            <label htmlFor="telegram-account-name">Account label</label>
            <input
              id="telegram-account-name"
              autoFocus
              value={editingName}
              maxLength={48}
              onChange={(event) => setEditingName(event.target.value)}
            />
            <div className="telegram-dialog-actions">
              <button type="button" onClick={() => setEditingTab(null)}>Cancel</button>
              <button type="button" className="is-primary" onClick={saveName}>Save</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
