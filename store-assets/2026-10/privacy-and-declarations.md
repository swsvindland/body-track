# Pendum Body privacy and store declarations

These are source-based preparation notes, not submitted declarations or a binary privacy audit. Match the answers to the final release and all bundled SDKs.

## Apple privacy

Candidate answer: Data Not Collected. The source stores tracking data on device and has no account, ads, analytics or developer record server. Apple's definition excludes data processed only on-device. Confirm the release SDKs introduce no off-device collection. Optional Apple Health integration must still be described in the privacy policy. 

No tracking/advertising identifier use was found. No account deletion flow is required for an app without accounts; local deletion and health-record behavior must be explained.

## Google Data safety

Candidate collection answer: No data collected, subject to release verification. Local access alone is excluded from collection. Sharing must be considered separately: transfers to another app can count even on-device. Optional Health Connect transfer may qualify for the user-initiated action or prominent disclosure and consent exception; verify the actual disclosure and consent flow before answering No data shared. Do not automatically equate local storage with no sharing. There is no server-side account, so account-creation/deletion questions are not applicable to this implementation.

Data handled locally: weight, height, dated body measurements, measured body fat, the selected body-fat equation, preferences and progress photos. Supported health integration: On iOS, weight and height sync both ways, and recorded body-fat percentages and waist circumference are exported to Apple Health. On Android, weight and height sync both ways, and recorded body-fat percentages are exported to Health Connect. Photos, calculated body-fat estimates, BMI, FFMI and other tape measurements are not exported. Imported records are managed by their original source; deleting them here hides the local copy. Deleting app-origin measurements queues linked health-record deletion for the next successful sync.

## Google health declaration

Suggested categories based on the implemented features: Activity and Fitness (body composition and weight) and Nutrition and Weight Management (weight tracking). Do not select “no health features.” Complete the console's current choices from the actual build. The app does not claim medical-device approval.

| Permission | User benefit |
|---|---|
| READ_WEIGHT and WRITE_WEIGHT | Import and export the user's dated weight log. |
| READ_HEIGHT and WRITE_HEIGHT | Import and export height history used in the user's record and reference calculations. |
| WRITE_BODY_FAT | Export manually recorded body-fat percentages; calculated estimates are excluded. |
| READ_HEALTH_DATA_IN_BACKGROUND | Continue permissioned weight/height import during OS-scheduled sync. Foreground sync remains available. |

Permission justification copy: Pendum Body uses only the health types listed above to provide user-enabled health integration. Core manual tracking remains available without health access. Users control access in Settings and in the platform health service. Data is not used for advertising or sold. Read access and background execution are limited by platform permissions.

Body includes a Health Connect rationale route (`src/app/health-privacy.tsx`) and a native intent plugin. Verify both Health Connect rationale entry points on the final Android build.

## Age and content ratings

Complete Apple's age questionnaire and Google's IARC questionnaire honestly; let each console assign the rating. Declare health/wellness references and assess private user-selected progress photos under the current definitions. There is no public user-content feed, messaging, unrestricted web browsing, gambling, advertising or sales of regulated products. Intended audience is adults. Do not invent a numeric rating.

## Remaining owner entries

Review contact, support email, public policy/support URLs, copyright confirmation, business/trader details and release choices remain owner-supplied. See `submission-checklist.md`. Official definitions are linked in `sources.md`.
