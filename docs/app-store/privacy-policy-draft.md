# Pendum Body privacy policy — draft for publication

> **Publish this draft.** It is Pendum Body's privacy policy, the one the App Store and Google Play listings link to. `store-assets/2026-10/privacy-policy-draft.md` was written before export existed: it says the app offers no data export, so do not publish it. Remove this note before publishing.

Effective date: [publication date]
Operator: [legal person or company]
Privacy contact: [contact email]

Pendum Body stores the weight entries, height entries, body measurements, preferences and progress photos you add in the app's local storage on your device. You do not need an account. The developer does not operate an account service, a server or any other developer-hosted storage for these records, and does not receive them. Records leave your device only when you choose to: through Apple Health or Health Connect sync, or an export you save or share (described below).

## Photos

If you choose to take a progress photo, the app requests camera permission. You may also choose images from your photo library. Selected images are copied to the app's private document storage. You can delete saved photos in the app. Progress photos are not sent to Apple Health or Health Connect.

## Apple Health and Health Connect

Health integration is optional. With your authorization, on iPhone the app reads weight and height from Apple Health and writes weight, height, recorded body-fat percentages and waist circumference to Apple Health. On Android, it reads weight and height from Health Connect and writes weight, height and recorded body-fat percentages to Health Connect. Calculated estimates and other circumference measurements are not written to either service. You control these permissions in iOS and in Health Connect. Apple Health, Health Connect and any other apps you authorize are subject to their respective privacy practices.

Disabling sync stops scheduled integration; it does not erase previously saved Health records. Imported records remain managed by their original source. Deleting an imported record in Pendum Body hides it locally without deleting the source record. Deleting an app-origin measurement queues deletion of its linked Health record for the next successful sync.

## Exports and restores

You can export your data from Settings › Backup › Export data. The export is a single file containing your weight entries, height entries, body measurements, progress photos, app settings, the readings the app imported from Apple Health or Health Connect, and the bookkeeping the app uses to keep those readings in sync. The app creates the file on your device and hands it to the share sheet (or, on Android, the folder you pick); where the file goes from there is your choice.

Restoring a file (Settings › Backup › Restore from a file) replaces the records in the app with the file's contents. Before replacing anything, the app keeps a copy of the data it replaces on your device, so the restore can be undone; it keeps the copies of the last two restores. Restoring turns Health sync off until you turn it on again.

Export files are not encrypted by the app. Anyone who can open the file can read your records and photos, so keep exported files somewhere private. The app does not upload export files anywhere; the developer has no server for them, never receives a copy and cannot access them. If you save a file to a cloud service such as iCloud Drive or Google Drive, it is stored under that service's privacy policy.

## Retention and device backups

Records remain in local app storage until deleted. Exports you made remain wherever you saved them until you delete them. Operating-system backups may include app data depending on your device settings; the app's restore copies and working files are excluded from them. Removing the app may remove its local records and photos. Retention of operating-system backups is controlled by the operating system and your backup provider.

## Contact and changes

For questions about privacy, contact [contact email]. We will update this policy when the app's data practices change.

---

Publication checklist: remove the note at the top; replace all bracketed fields; confirm the release binary and third-party dependencies do not transmit analytics, diagnostics or other data to the developer or partners; update this policy to match any such services; host at a public HTTPS URL. This draft describes the source reviewed on September 11, 2026, with the export and restore sections added and the app name changed to Pendum Body on October 5, 2026, and is not yet a published policy. The app has no automatic cloud backup; if one is added later, this policy must describe it before that release.
