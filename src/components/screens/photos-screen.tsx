import { useState } from "react";
import { Alert, Image, Pressable, View, useWindowDimensions } from "react-native";
import {
  Button,
  Choices,
  DateInput,
  Editor,
  ErrorText,
  Label,
  Screen,
  SystemState,
  Text,
} from "@/vector";
import { Timeline } from "heroui-native-pro";
import * as ImagePicker from "expo-image-picker";
import { Directory, File, Paths } from "expo-file-system";
import { eq } from "drizzle-orm";
import { db, photos, type ProgressPhoto } from "@/db";
import { useStore } from "@/lib/store";
import { dayOf, localDay, validDay } from "@/lib/metrics";

type Pose = ProgressPhoto["pose"];
const filters = ["all", "front", "side", "back"] as const;
export function PhotosScreen() {
  const { photos: records, t, date, refresh } = useStore();
  const [filter, setFilter] = useState<Pose | "all">("all");
  const [pose, setPose] = useState<Pose>("front");
  const [day, setDay] = useState(localDay());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProgressPhoto | null>(null);
  const [preview, setPreview] = useState<ProgressPhoto | null>(null);
  const { height } = useWindowDimensions();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(24);
  // Only an edit has anything to lose: a new photo is saved the moment it is taken or chosen.
  const dirty = open && !!editing && (day !== dayOf(editing.measuredAt) || pose !== editing.pose);
  const visible = records.filter((p) => filter === "all" || p.pose === filter);
  const days = new Map<string, ProgressPhoto[]>();
  for (const photo of visible) {
    const photoDay = dayOf(photo.measuredAt);
    const group = days.get(photoDay);
    if (group) group.push(photo);
    else days.set(photoDay, [photo]);
  }
  const groups = [...days].sort(([a], [b]) => b.localeCompare(a));
  // Extend the page to include every photo on its final day.
  const shownGroups: typeof groups = [];
  let shownCount = 0;
  for (const group of groups) {
    if (shownCount >= limit) break;
    shownGroups.push(group);
    shownCount += group[1].length;
  }
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
  return (
    <>
      <Screen title={t("photos")} subtitle={t("cadenceWeeklyMonthly")}>
        <Text tone="muted">{t("localPhotos")}</Text>
        <Button onPress={() => launch(null)}>{t("addPhoto")}</Button>
        <Choices
          values={filters}
          value={filter}
          onChange={(next) => {
            setFilter(next);
            setLimit(24);
          }}
          label={t}
          accessibilityLabel={t("pose")}
        />
        <View className="gap-6">
          {!visible.length ? (
            <SystemState kind="empty" message={t("photoEmpty")} />
          ) : (
            <Timeline size="sm">
              {shownGroups.map(([photoDay, photos], index) => (
                <Timeline.Item key={photoDay} status={index === 0 ? "current" : "default"}>
                  <Timeline.Rail />
                  <Timeline.Content className="min-w-0 gap-3">
                    <Label accessibilityRole="header">{date(photoDay)}</Label>
                    <View className="-mx-1 max-w-[744px] flex-row flex-wrap gap-y-3">
                      {photos.map((photo) => (
                        <View key={photo.id} className="w-1/3 px-1">
                          <Pressable
                            className="min-w-0 gap-2 rounded-control focus:outline-2 focus:outline-offset-2 focus:outline-tint"
                            accessibilityRole="button"
                            accessibilityLabel={t("photoOn", {
                              pose: t(photo.pose),
                              date: date(photo.measuredAt),
                            })}
                            onPress={() => setPreview(photo)}
                          >
                            {/* A 1pt keyline: white photos on the white canvas still read as tiles. */}
                            <Image
                              source={{ uri: photoFile(photo).uri }}
                              className="rounded-control border border-border"
                              style={{ width: "100%", aspectRatio: 0.7 }}
                              resizeMode="cover"
                              accessibilityLabel={t(photo.pose)}
                            />
                            <Text variant="bodyStrong">{t(photo.pose)}</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </Timeline.Content>
                </Timeline.Item>
              ))}
            </Timeline>
          )}
          {visible.length > shownCount && (
            <Button variant="ghost" onPress={() => setLimit(shownCount + 24)}>
              {t("showMore")}
            </Button>
          )}
        </View>
      </Screen>
      <Editor
        title={preview ? t(preview.pose) : t(editing ? "editPhoto" : "addPhoto")}
        eyebrow={preview ? date(preview.measuredAt) : undefined}
        open={open || preview !== null}
        close={() => {
          setOpen(false);
          setPreview(null);
        }}
        busy={busy}
        dirty={dirty}
        primary={
          preview
            ? undefined
            : editing
              ? { label: t("save"), onPress: () => void save() }
              : { label: t("takePhoto"), onPress: () => void save("camera") }
        }
        destructive={!preview && editing ? { label: t("delete"), onPress: remove } : undefined}
      >
        {preview ? (
          <>
            <Image
              source={{ uri: photoFile(preview).uri }}
              style={{ width: "100%", height: height * 0.65 }}
              resizeMode="contain"
              accessibilityLabel={t("photoOn", {
                pose: t(preview.pose),
                date: date(preview.measuredAt),
              })}
            />
            <Button
              variant="secondary"
              onPress={() => {
                const photo = preview;
                setPreview(null);
                launch(photo);
              }}
            >
              {t("edit")}
            </Button>
          </>
        ) : (
          <>
            <DateInput label={t("date")} value={day} onChange={setDay} disabled={busy} />
            <Choices
              values={["front", "side", "back"] as const}
              value={pose}
              onChange={setPose}
              label={t}
              accessibilityLabel={t("pose")}
            />
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
              <Button variant="secondary" onPress={() => void save()} disabled={busy}>
                {t("choosePhoto")}
              </Button>
            )}
          </>
        )}
      </Editor>
    </>
  );
}
function photoFile(photo: ProgressPhoto) {
  return new File(Paths.document, "progress-photos", photo.uri);
}
