# Body Track implementation plan

## Product decisions

- Local-first iOS and Android app; SQLite stores canonical kilograms and centimeters. No account or server is required. Progress images are copied into private app storage.
- Home opens with smoothed weight, BMI, estimated body fat and FFMI, followed by weight history. Records can be backdated, corrected and deleted.
- Trend: daily mean followed by an exponentially weighted average with a seven-day half-life, adjusted for elapsed calendar days. This is an independently implemented trend, not MacroFactor's proprietary algorithm. No invented observations on missing days.
- Height has dated history; body sessions allow optional neck, shoulders, chest, waist, abdomen, hips and left/right upper arms, forearms, thighs, calves and ankles. Record whichever sites are useful.
- Body fat uses an explicitly selected male/female US Navy circumference equation or a manually entered percentage. FFMI uses that estimate and trend weight. No inferred sex; unavailable inputs display an explanation. Calculations are adult estimates, not diagnoses.
- Progress photos have front/side/back poses and capture dates, with a chronological gallery and comparison. Suggested cadence is guidance, never a logging restriction.
- Unit preferences: metric (kg/cm), imperial (lb/in), stone (decimal st/in). Language and number/date formatting are independent of stored values.
- Initial languages: English, Spanish, French, German, Italian, Portuguese, Dutch, Swedish, Japanese, Korean and Simplified Chinese. Translation copy needs native-speaker review before release.
- HealthKit / Health Connect: explicit foreground sync for weight and height; import external records and export local records with stable IDs to prevent duplication. Photos and circumference estimates stay in the app. Permissions, unavailable native builds, and failures are visible.

## Build sequence

1. Add migrations, shared data access, locale/unit preferences and validated numeric/date helpers.
2. Implement dated weight, height and body measurement editors with persistent history.
3. Add trend chart and dashboard metrics with missing-input and freshness context.
4. Add durable photo import, pose filtering, deletion and comparison.
5. Add settings translations, native health adapters and Expo native configuration.
6. Verify types, lint, migration upgrades, calculations, conversions and sync deduplication; document device QA and build requirements.

## Release checks

- Install a development build on an iPhone and Android device. Expo Go cannot validate health integrations.
- Exercise denied/partial/revoked health permissions, repeated imports/exports, corrections/deletions, offline usage and provider-origin records.
- Exercise photo cancellation, persistence after restart and removal; test large fonts, dark/light mode, all locales and locale-specific decimal input.
- Review store privacy declarations, signing identifiers, Health Connect access declaration and HealthKit entitlement with the app owner's release configuration.

## Implementation status

- Implemented the six build steps above, including native health adapters and permission configuration.
- Verified TypeScript, lint and eight automated tests; iOS and Android Metro production exports succeed.
- Built the Android arm64 debug APK successfully with all native modules (442 Gradle tasks). The native Health Connect module and permission-rationale activity compile.
- Opened the dashboard and body screen in an iPhone simulator using Expo Go. Native health permission and synchronization flows still require device QA with a development build.
- Health Connect imports the last 29 days under default history permissions. Imported snapshots do not follow remote deletions. These constraints are explained in README.md.
- Translation completeness is tested; native-speaker review remains a release task.
