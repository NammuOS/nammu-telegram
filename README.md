# Nammu Telegram

Official Telegram integration for NammuOS, distributed as the signed `os.nammu.telegram` package.

The package owns account labels, colors, mute state, and the Telegram application shell. NammuOS Core owns all remote rendering and authenticated browser profiles:

- Web uses one pooled Gecko/WASM session with an isolated Firefox contextual identity per account.
- Windows Desktop uses an isolated persistent WebView2 partition per account.

The package never receives browser internals, profile paths, authentication tokens, cookies, or native handles.
Surface creation tolerates the bounded Gecko startup window without showing a branded loading interstitial; all other failures remain visible and retryable.

## Development

```powershell
bun install
bun test
bun run typecheck
bun run build
```

The build creates `dist/os.nammu.telegram-1.0.0-unsigned.napp`. Official releases are signed by the external NammuOS release signer; private signing material never belongs in this repository.
