---
description: Professional Development and Deployment Workflow for Grammarly Clone
---

# Professional Development Workflow

This workflow ensures a stable, error-free development experience when working on the Grammarly Clone with Sarvam AI integration.

## 1. Environment Setup
Always ensure your API keys are isolated from the codebase.
- Ensure `.env` exists in the root directory.
- Variable: `VITE_SARVAM_API_KEY=your_key_here`
- **Warning**: Never commit `.env` to version control.

## 2. The Build Cycle
Since this is a Chrome Extension, changes in `src/` must be compiled into `dist/` before they are visible in the browser.

// turbo
- Run the full build command:
  ```powershell
  npm run build
  ```
- This executes:
  1. `build:popup`: Compiles the React settings menu.
  2. `build:content`: Compiles the UI injected into websites.
  3. `build:background`: Compiles the Sarvam AI API logic and service worker.

## 3. Browser Syncing
After every successful build, you must alert Chrome to the changes.
1. Open `chrome://extensions`.
2. Locate **Grammarly Clone**.
3. Click the **Refresh (Circular Arrow)** icon.
4. **Important**: Always refresh the active tab (F5) on the website you are testing (e.g., Google or LinkedIn) to reload the new Content Script.

## 4. Debugging & Error Monitoring
A professional developer monitors three distinct consoles:

### A. The User Interface (Content Script)
- **Where**: Right-click any webpage -> Inspect -> Console.
- **What**: Look for `[Grammarly Clone]` logs. This reveals issues with text detection or UI rendering.

### B. The Brain (Service Worker)
- **Where**: `chrome://extensions` -> Click "service worker" link.
- **What**: This is where Sarvam AI API errors (401, 429, 500) will appear.

### C. The Settings (Popup)
- **Where**: Right-click extension icon -> Inspect Popup.
- **What**: Debugs the "Enable/Disable" toggle and configuration UI.

## 5. Performance Optimization
- **Debouncing**: Ensure `checkTimeoutRef` in `ContentApp.tsx` remains at ~1000ms to avoid rate-limiting your Sarvam AI account.
- **Model Choice**: Use `sarvam-30b` for production-grade quality or `sarvam-2b` (if available via completion) for speed.

## 6. Deployment Readiness
Before shipping:
1. Run `npm run build` one last time.
2. Verify `manifest.json` in `dist/` has the correct `host_permissions` for `https://api.sarvam.ai/*`.
3. Zip the `dist/` folder for upload to the Chrome Web Store.
