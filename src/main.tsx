import React from 'react';
import { createRoot } from 'react-dom/client';
import { getNammuSDK } from '@nammu/sdk';
import TelegramApp from './telegram/TelegramApp';
import { initializeTelegramStorage } from './telegram/telegramStore';
import './styles.css';

async function start() {
  const sdk = getNammuSDK();
  document.documentElement.dataset.theme = 'horizon';
  const initialTabs = await initializeTelegramStorage(sdk);
  createRoot(document.getElementById('root')!).render(
    <TelegramApp sdk={sdk} initialTabs={initialTabs} />,
  );
  await sdk.ready();
}

void start();
