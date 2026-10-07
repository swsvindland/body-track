# Product evidence

Claims were checked against the current repository source on October 4, 2026. No source review is a substitute for final-device QA.

| Claim | Source |
|---|---|
| Weight trend, adult metric context | `src/components/dashboard.tsx`, `src/lib/metrics.ts`, `src/lib/metric-context.ts` |
| Body measurement fields and dated records | `src/db/schema.ts`, `src/components/measurements/body-form.tsx` |
| Private photos and comparison | `src/components/measurements`, photo screens and `src/lib/store.tsx` |
| Apple vs Android sync | `src/lib/health-native.ios.ts`, `src/lib/health-native.android.ts` |

Languages and units: `src/lib/locales`, app settings and `app.json`. No app account, ad, analytics or purchase SDK was found in the reviewed app implementation. Review the final dependency/binary inventory before submitting privacy answers. Paid-download pricing and Pendum family names follow `vector-marketing/docs/sources/owner-decisions.md`.
