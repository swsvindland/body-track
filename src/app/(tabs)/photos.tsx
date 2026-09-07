import { useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";
import { Button, Card } from "heroui-native";
import * as ImagePicker from "expo-image-picker";
import { Directory, File, Paths } from "expo-file-system";
import { eq } from "drizzle-orm";
import { db, photos, type ProgressPhoto } from "@/db";
import { useStore } from "@/lib/store";
import { dayOf, localDay, validDay } from "@/lib/metrics";
import { Choices, Editor, ErrorText, Field, Screen } from "@/components/ui";

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
  async function save() {
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
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.85,
          exif: false,
        });
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
        <Button onPress={() => launch(null)}>
          {t("add")} · {t("photos")}
        </Button>
        <Choices
          values={["all", "front", "side", "back"] as const}
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setLimit(24);
          }}
        />
        <Button
          variant="secondary"
          isDisabled={comparison.length !== 2}
          onPress={() => setComparing(true)}
        >
          {t("compare")} ({selected.length}/2)
        </Button>
        {!visible.length && <Text className="py-8 text-center text-muted">{t("photoEmpty")}</Text>}
        <View className="flex-row flex-wrap gap-3">
          {visible.slice(0, limit).map((photo) => (
            <Card key={photo.id} style={{ width: "47%" }}>
              <Card.Body className="gap-2">
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected.includes(photo.id) }}
                  accessibilityLabel={`${t("compare")} · ${t(photo.pose)} · ${date(photo.measuredAt)}`}
                  onPress={() => toggle(photo)}
                >
                  <Image
                    source={{ uri: photoFile(photo).uri }}
                    style={{ width: "100%", aspectRatio: 0.7, borderRadius: 12 }}
                    resizeMode="cover"
                    accessibilityLabel={t(photo.pose)}
                  />
                  <Text className="mt-2 text-sm text-accent">
                    {selected.includes(photo.id) ? "✓ " : ""}
                    {t("compare")}
                  </Text>
                </Pressable>
                <Text className="font-medium text-foreground">{t(photo.pose)}</Text>
                <Text className="text-sm text-muted">{date(photo.measuredAt)}</Text>
                <Button variant="ghost" onPress={() => launch(photo)}>
                  {t("edit")}
                </Button>
              </Card.Body>
            </Card>
          ))}
        </View>
        {visible.length > limit && (
          <Button variant="ghost" onPress={() => setLimit(limit + 24)}>
            {t("photos")} +24
          </Button>
        )}
      </Screen>
      <Editor
        title={`${t(editing ? "edit" : "add")} · ${t("photos")}`}
        open={open}
        close={() => setOpen(false)}
        busy={busy}
      >
        <Field label={`${t("date")} (${t("dateHint")})`} value={day} onChange={setDay} />
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
        <Button onPress={save} isDisabled={busy}>
          {t(editing ? "save" : "choosePhoto")}
        </Button>
        {editing && (
          <Button variant="danger-soft" onPress={remove}>
            {t("delete")}
          </Button>
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
              <Text className="mt-2 text-center text-muted">{date(photo.measuredAt)}</Text>
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
