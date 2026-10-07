# Pendum Body verification

Checked October 4, 2026. These results cover local development builds and prepared store assets; they do not certify a signed production release.

## Completed checks

| Check | Result |
|---|---|
| iOS native Debug build | Passed on iPhone simulator |
| Android native Debug build | Passed, arm64 emulator |
| TypeScript | Passed |
| Targeted numeric/unit formatter tests | 6 passed, 0 failed |
| Shared Vector kit drift check | Passed, 0 differences |
| Store copy field limits and text exports | See `copy-validation.json` and `package-validation.json` |
| Image dimensions, opaque RGB, bytes and SHA-256 | See `asset-manifest.json` and `package-validation.json` |
| Screenshot visual review | Five iPhone and five Android images reviewed individually and in contact sheets |

## Capture provenance

The iOS images use an iPhone 18 Pro Max simulator on iOS 27, captured at 1320 × 2868. Android images use an isolated, read-only Pixel 10 Pro XL AVD on API 37, configured to 1080 × 1920 for the store set. The raw files are separate real platform captures. Health sync and reminders are off in the fixtures. No personal user database was used.

Phone marketing artwork follows the existing fitness-native October package: dark teal background, white/cyan headline and a native phone screen in a frame. The renderer scales the native screen proportionally; it does not redraw the app UI. Source hashes and treatments are recorded in `design/composition.json`.

The Body fixture includes synthetic demonstration progress photos, dated sample weights and measurements. They do not depict a customer result or promise a transformation.

## Fixes made during capture

Android Hermes sometimes returns the entire formatted quantity as one `formatToParts` item. The shared formatter now uses the full localized string when the individual parts cannot safely be separated. This restores the weight/fluid/height values and avoids duplicated milligram labels. The canonical Vector kit and this app's copy include the fix and regression coverage.

## Before release

Build and verify the signed release, reconcile version/build numbers with store history, review its complete SDK/privacy inventory, and test health permissions, record correction/deletion and background behavior on physical devices. The development builds are not uploadable production binaries.

Support/review contacts, the confirmed copyright holder, public support/privacy pages, territories and release timing remain owner entries. No listing, pricing, declaration or binary has been uploaded by this work.
