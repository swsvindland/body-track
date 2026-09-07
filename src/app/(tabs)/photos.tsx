import { useState } from "react";
import { Alert, Image, Pressable, View } from "react-native";
import { SystemButton, SystemPanel, SystemText as Text } from "@/components/system";
import * as ImagePicker from "expo-image-picker";
import { Directory, File, Paths } from "expo-file-system";
import { eq } from "drizzle-orm";
import { db, photos, type ProgressPhoto } from "@/db";
import { useStore } from "@/lib/store";
import { dayOf, localDay, validDay } from "@/lib/metrics";
import { Choices, DateInput, Editor, ErrorText, Screen } from "@/components/ui";

type Pose = ProgressPhoto["pose"];
export default function Photos() {
  const { photos: records, t, date, refresh } = useStore();
  const [filter, setFilter] = useState<Pose | "all">("all");
  const [pose, setPose] = useState<Pose>("front");
  const [day, setDay] = useState(localDay());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProgressPhoto | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(24);
  const visible = records.filter((p) => filter === "all" || p.pose === filter);
  const comparison = records
    .filter((p) => selected.includes(p.id))
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  function launch(photo: ProgressPhoto | null) {
    setEditing(photo);
    setDay(photo ? dayOf(photo.measuredAt) : localDay());
    setPose(photo?.pose ?? (filter === "all" ? "front" : filter));
    setError("");
    setOpen(true);
  }
  async function save(source: "camera" | "library" = "library") {
    if (busy) return;
    if (!validDay(day)) {
      setError(t("invalidDate"));
      return;
    }
    setBusy(true);
    setError("");
    let copied: File | undefined;
    try {
      if (editing) {
        db.update(photos).set({ pose, measuredAt: day }).where(eq(photos.id, editing.id)).run();
      } else {
        if (source === "camera") {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            setError(t("cameraPermissionDenied"));
            return;
          }
        }
        const options: ImagePicker.ImagePickerOptions = {
          mediaTypes: ["images"],
          quality: 0.85,
          exif: false,
        };
        const result =
          source === "camera"
            ? await ImagePicker.launchCameraAsync(options)
            : await ImagePicker.launchImageLibraryAsync(options);
        if (result.canceled) return;
        const asset = result.assets[0];
        const directory = new Directory(Paths.document, "progress-photos");
        directory.create({ idempotent: true, intermediates: true });
        const extension = asset.uri.split(".").at(-1)?.split("?")[0]?.toLowerCase();
        const safeExtension = extension && /^[a-z0-9]{2,5}$/.test(extension) ? extension : "jpg";
        copied = new File(
          directory,
          `${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExtension}`
        );
        new File(asset.uri).copy(copied);
        // Store only the basename: iOS may change the app container path after an update.
        db.insert(photos).values({ uri: copied.name, pose, measuredAt: day }).run();
      }
      refresh();
      setOpen(false);
    } catch {
      if (copied?.exists) copied.delete();
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }
  function remove() {
    if (!editing) return;
    Alert.alert(t("delete"), t("deleteConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: () => {
          try {
            const file = photoFile(editing);
            db.transaction((tx) => {
              tx.delete(photos).where(eq(photos.id, editing.id)).run();
              if (file.exists) file.delete();
            });
            setSelected((ids) => ids.filter((id) => id !== editing.id));
            refresh();
            setOpen(false);
          } catch {
            refresh();
            setError(t("error"));
          }
        },
      },
    ]);
  }
  function toggle(photo: ProgressPhoto) {
    setSelected((ids) => {
      if (ids.includes(photo.id)) return ids.filter((id) => id !== photo.id);
      // Compare matching poses so changes in viewpoint don't obscure progress.
      const samePose = ids.filter((id) => records.find((p) => p.id === id)?.pose === photo.pose);
      return [...samePose.slice(-1), photo.id];
    });
  }
  return (
    <>
      <Screen title={t("photos")} subtitle={`${t("cadence")}: ${t("weekly")} – ${t("monthly")}`}>
        <Text className="text-muted">{t("localPhotos")}</Text>
        <SystemButton onPress={() => launch(null)}>
          {t("add")} · {t("photos")}
        </SystemButton>
        <Choices
          values={["all", "front", "side", "back"] as const}
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setLimit(24);
          }}
        />
        <SystemButton
          variant="secondary"
          isDisabled={comparison.length !== 2}
          onPress={() => setComparing(true)}
        >
          {t("compare")} ({selected.length}/2)
        </SystemButton>
        {!visible.length && <Text className="py-8 text-center text-muted">{t("photoEmpty")}</Text>}
        <View className="flex-row flex-wrap gap-3">
          {visible.slice(0, limit).map((photo) => (
            <SystemPanel
              key={photo.id}
              className="min-w-0 flex-1 p-4"
              style={{ flexBasis: "45%", maxWidth: "49%" }}
            >
              <SystemPanel.Body className="gap-2">
                <Pressable
                  className="rounded-md border border-transparent focus:border-focus"
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected.includes(photo.id) }}
                  accessibilityLabel={`${t("compare")} · ${t(photo.pose)} · ${date(photo.measuredAt)}`}
                  onPress={() => toggle(photo)}
                >
                  <Image
                    source={{ uri: photoFile(photo).uri }}
                    className="rounded-md"
                    style={{ width: "100%", aspectRatio: 0.7 }}
                    resizeMode="cover"
                    accessibilityLabel={t(photo.pose)}
                  />
                  <Text className="mt-2 text-sm text-link">
                    {selected.includes(photo.id) ? "✓ " : ""}
                    {t("compare")}
                  </Text>
                </Pressable>
                <Text className="font-medium text-foreground">{t(photo.pose)}</Text>
                <Text className="font-mono text-xs font-mono text-xs text-muted">
                  {date(photo.measuredAt)}
                </Text>
                <SystemButton variant="ghost" onPress={() => launch(photo)}>
                  {t("edit")}
                </SystemButton>
              </SystemPanel.Body>
            </SystemPanel>
          ))}
        </View>
        {visible.length > limit && (
          <SystemButton variant="ghost" onPress={() => setLimit(limit + 24)}>
            {t("photos")} +24
          </SystemButton>
        )}
      </Screen>
      <Editor
        title={`${t(editing ? "edit" : "add")} · ${t("photos")}`}
        open={open}
        close={() => setOpen(false)}
        busy={busy}
      >
        <DateInput label={t("date")} value={day} onChange={setDay} disabled={busy} />
        <Choices values={["front", "side", "back"] as const} value={pose} onChange={setPose} />
        {editing && (
          <Image
            source={{ uri: photoFile(editing).uri }}
            style={{ width: "100%", height: 360 }}
            resizeMode="contain"
            accessibilityLabel={t(editing.pose)}
          />
        )}
        <ErrorText message={error} />
        {!editing && (
          <SystemButton onPress={() => save("camera")} isDisabled={busy}>
            {t("takePhoto")}
          </SystemButton>
        )}
        <SystemButton
          onPress={() => save()}
          variant={editing ? "primary" : "secondary"}
          isDisabled={busy}
        >
          {t(editing ? "save" : "choosePhoto")}
        </SystemButton>
        {editing && (
          <SystemButton variant="danger-soft" onPress={remove}>
            {t("delete")}
          </SystemButton>
        )}
      </Editor>
      <Editor title={t("compare")} open={comparing} close={() => setComparing(false)}>
        <View className="flex-row gap-2">
          {comparison.map((photo) => (
            <View key={photo.id} style={{ flex: 1 }}>
              <Image
                source={{ uri: photoFile(photo).uri }}
                style={{ width: "100%", aspectRatio: 0.55 }}
                resizeMode="contain"
                accessibilityLabel={`${t(photo.pose)} ${date(photo.measuredAt)}`}
              />
              <Text className="mt-2 text-center font-mono text-xs text-muted">
                {date(photo.measuredAt)}
              </Text>
            </View>
          ))}
        </View>
      </Editor>
    </>
  );
}
function photoFile(photo: ProgressPhoto) {
  return new File(Paths.document, "progress-photos", photo.uri);
}
