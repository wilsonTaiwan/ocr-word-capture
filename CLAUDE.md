# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome Extension (Manifest V3) that captures English words from any webpage via OCR screen selection and provides AI-powered Chinese translations using Google Gemini API. No build system — vanilla JS loaded directly by Chrome.

## Development Setup

```bash
npm install                    # Only needed to update Tesseract.js assets in lib/
```

Load in Chrome: `chrome://extensions/` → Developer mode → Load unpacked → select this folder.

After loading, set a Gemini API key via the extension popup → Settings page.

## Architecture

Three execution contexts communicate via `chrome.runtime.sendMessage`:

- **Service Worker** (`service-worker.js`) — handles tab capture (`captureVisibleTab`), Gemini API calls, context menu, word storage. Storage and Gemini code are inlined (not imported) due to MV3 `importScripts` path issues.
- **Content Script** (`content/content.js`) — injected on all pages. Manages the selection overlay, crops screenshots on canvas (with `devicePixelRatio` correction), runs Tesseract.js OCR, and renders floating tooltips. All injected UI uses Shadow DOM to avoid host page CSS conflicts.
- **Extension Pages** (`pages/`, `popup/`) — settings page for API key, word list page with card grid, popup with navigation buttons.

## Message Flow

1. User triggers OCR → service worker sends `ACTIVATE_OCR` to content script
2. Content script draws overlay → user drags rectangle → sends `CAPTURE_TAB` to service worker
3. Service worker returns screenshot dataURL → content script crops and runs Tesseract OCR
4. Content script sends `TRANSLATE_WORD` → service worker calls Gemini API, saves to `chrome.storage.local`, returns result
5. Content script updates floating tooltip with translation details

## Key Conventions

- `shared/storage.js` and `shared/gemini.js` exist as standalone modules used by extension pages, but their code is **duplicated inline** in `service-worker.js` because MV3 service workers have unreliable `importScripts` path resolution.
- All UI injected into web pages (overlay, tooltip) must use **Shadow DOM** with `mode: "closed"` for style isolation.
- Mouse coordinates must be multiplied by `window.devicePixelRatio` when cropping from `captureVisibleTab` screenshots.
- Tesseract.js assets (`lib/`, `traineddata/`) are bundled locally — CDN loading is blocked by MV3 CSP. Paths must use `chrome.runtime.getURL()`.
- The `wasm-unsafe-eval` CSP directive in manifest.json is required for Tesseract WASM.

## Data Storage

All data in `chrome.storage.local`:
- `geminiApiKey` — user's Google Gemini API key
- `words` — array of word entries with `id`, `word`, `translation`, `partOfSpeech`, `example`, `exampleTranslation`, `pinned`, `createdAt`
