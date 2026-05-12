# Privacy Policy for mulitcheck

Effective date: May 12, 2026

mulitcheck is a Chrome extension that lets users select or clear ranges of checkboxes with Shift+Click.

## Data We Store

The extension stores only user preferences needed for its features:

- Global enabled/disabled state.
- Per-site enable/disable overrides, stored by hostname.
- Language preference.

These preferences are stored with Chrome's `chrome.storage.sync` API so Chrome may sync them through the user's signed-in Chrome profile. The extension does not operate an external server and does not receive this data.

## Data We Access

The extension runs a content script on HTTP and HTTPS pages to detect checkbox clicks and apply range selection. It does not read form values, passwords, payment information, page text, cookies, browsing history, or files.

When the user opens the extension popup, the extension uses Chrome's `activeTab` permission to read the active tab URL temporarily. This is used only to determine the current hostname so the user can configure per-site behavior.

## Data Sharing

The extension does not sell, rent, transfer, or share user data with third parties. It does not include advertising, analytics, tracking pixels, or remote code.

## Limited Use Statement

The use of information received from Chrome APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Security

The extension keeps all feature logic inside the packaged extension files. It does not transmit user data to any external service.

## Changes

This policy may be updated when the extension's behavior changes. Material changes will be reflected by updating this file and the effective date.

## Contact

For privacy questions, open an issue at:

https://github.com/trah01/MulitCheck/issues
