import { Ionicons } from "@expo/vector-icons";
import { desc, eq } from "drizzle-orm";
import {
  Button,
  Card,
  Description,
  Dialog,
  FieldError,
  Input,
  Label,
  TextField,
  Typography,
  useThemeColor,
} from "heroui-native";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { db, weightEntries, type WeightEntry } from "@/db";

type DisplayUnit = "kg" | "lb";

// Weight is always persisted in kg. Replace this with the user's setting when it is added.
const DISPLAY_UNIT: DisplayUnit = "kg";
const KG_PER_LB = 0.45359237;

function toDisplayWeight(weightKg: number, unit: DisplayUnit): number {
  return unit === "lb" ? weightKg / KG_PER_LB : weightKg;
}

function toKilograms(weight: number, unit: DisplayUnit): number {
  return unit === "lb" ? weight * KG_PER_LB : weight;
}

function formatWeight(weightKg: number, unit: DisplayUnit): string {
  return `${toDisplayWeight(weightKg, unit).toFixed(1)} ${unit}`;
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function WeightChart({ entries }: { entries: WeightEntry[] }): JSX.Element {
  const [width, setWidth] = useState(0);
  const accent = String(useThemeColor("accent"));
  const border = String(useThemeColor("border"));
  const muted = String(useThemeColor("muted"));
  const chartEntries = useMemo(() => [...entries].reverse().slice(-12), [entries]);
  const values = chartEntries.map((entry) => toDisplayWeight(entry.weightKg, DISPLAY_UNIT));
  const height = 160;
  const padding = 14;

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  if (!entries.length) {
    return (
      <View className="h-40 items-center justify-center" onLayout={onLayout}>
        <Ionicons name="analytics-outline" size={28} color={muted} />
        <Text className="mt-3 text-sm text-muted">Your progress will appear here</Text>
      </View>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const usableWidth = Math.max(width - padding * 2, 1);
  const usableHeight = height - padding * 2;
  const points = values.map((value, index) => ({
    x:
      padding +
      (values.length === 1 ? usableWidth / 2 : (index / (values.length - 1)) * usableWidth),
    y: padding + ((max - value) / range) * usableHeight,
  }));
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = `${linePath} L ${points.at(-1)?.x ?? padding} ${height - padding} L ${points[0]?.x ?? padding} ${height - padding} Z`;

  return (
    <View className="h-40" onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={height} accessibilityLabel="Weight trend chart">
          <Defs>
            <LinearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={accent} stopOpacity={0.28} />
              <Stop offset="1" stopColor={accent} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          <Path
            d={`M ${padding} ${height - padding} L ${width - padding} ${height - padding}`}
            stroke={border}
            strokeWidth={1}
          />
          <Path d={areaPath} fill="url(#weightArea)" />
          {points.length > 1 && (
            <Path
              d={linePath}
              fill="none"
              stroke={accent}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {points.map((point, index) => (
            <Circle key={chartEntries[index].id} cx={point.x} cy={point.y} r={4} fill={accent} />
          ))}
        </Svg>
      )}
    </View>
  );
}

export default function WeightTab(): JSX.Element {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WeightEntry | null>(null);
  const [weightInput, setWeightInput] = useState("");
  const [error, setError] = useState("");
  const accent = useThemeColor("accent");
  const accentForeground = useThemeColor("accent-foreground");
  const muted = useThemeColor("muted");

  const refreshEntries = useCallback(async () => {
    const records = await db.select().from(weightEntries).orderBy(desc(weightEntries.measuredAt));
    setEntries(records);
  }, []);

  useEffect(() => {
    let isMounted = true;

    db.select()
      .from(weightEntries)
      .orderBy(desc(weightEntries.measuredAt))
      .then((records) => {
        if (isMounted) setEntries(records);
      })
      .catch((err) => console.error("Failed to load weight entries:", err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const latest = entries[0];
  const previous = entries[1];
  const change =
    latest && previous ? toDisplayWeight(latest.weightKg - previous.weightKg, DISPLAY_UNIT) : null;

  const openNewEntry = () => {
    setEditingEntry(null);
    setWeightInput("");
    setError("");
    setDialogOpen(true);
  };

  const openEntry = (entry: WeightEntry) => {
    setEditingEntry(entry);
    setWeightInput(toDisplayWeight(entry.weightKg, DISPLAY_UNIT).toFixed(1));
    setError("");
    setDialogOpen(true);
  };

  const saveEntry = async () => {
    const parsedWeight = Number.parseFloat(weightInput.replace(",", "."));
    if (
      !Number.isFinite(parsedWeight) ||
      parsedWeight <= 0 ||
      parsedWeight > (DISPLAY_UNIT === "kg" ? 500 : 1100)
    ) {
      setError(`Enter a valid weight in ${DISPLAY_UNIT}.`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const weightKg = Math.round(toKilograms(parsedWeight, DISPLAY_UNIT) * 1000) / 1000;
      if (editingEntry) {
        await db
          .update(weightEntries)
          .set({ weightKg, updatedAt: new Date() })
          .where(eq(weightEntries.id, editingEntry.id));
      } else {
        await db.insert(weightEntries).values({ weightKg, measuredAt: new Date().toISOString() });
      }
      await refreshEntries();
      setDialogOpen(false);
    } catch (err) {
      console.error("Failed to save weight entry:", err);
      setError("Could not save this weigh-in. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = () => {
    if (!editingEntry) return;
    Alert.alert(
      "Delete weigh-in?",
      `${formatWeight(editingEntry.weightKg, DISPLAY_UNIT)} on ${formatDate(editingEntry.measuredAt)} will be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            try {
              await db.delete(weightEntries).where(eq(weightEntries.id, editingEntry.id));
              await refreshEntries();
              setDialogOpen(false);
            } catch (err) {
              console.error("Failed to delete weight entry:", err);
              setError("Could not delete this weigh-in. Please try again.");
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={accent} />
      </View>
    );
  }

  return (
    <Dialog isOpen={dialogOpen} onOpenChange={setDialogOpen} className="flex-1">
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <FlatList
          data={entries}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 112 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          ListHeaderComponent={
            <View className="mb-4 gap-5">
              <View>
                <Typography.Heading className="text-3xl text-foreground">Weight</Typography.Heading>
                <Typography.Paragraph className="mt-1 text-muted">
                  Track your trend over time
                </Typography.Paragraph>
              </View>

              <Card className="p-5">
                <Card.Header className="flex-row items-start justify-between">
                  <View>
                    <Card.Description>Latest</Card.Description>
                    <Text className="mt-1 text-4xl font-bold tabular-nums text-foreground">
                      {latest ? formatWeight(latest.weightKg, DISPLAY_UNIT) : `— ${DISPLAY_UNIT}`}
                    </Text>
                  </View>
                  {change !== null && (
                    <View className="rounded-full bg-surface-secondary px-3 py-1.5">
                      <Text className="text-xs font-medium tabular-nums text-surface-secondary-foreground">
                        {change > 0 ? "+" : ""}
                        {change.toFixed(1)} {DISPLAY_UNIT}
                      </Text>
                    </View>
                  )}
                </Card.Header>
                <Card.Body className="mt-4">
                  <WeightChart entries={entries} />
                </Card.Body>
              </Card>

              <View className="flex-row items-center justify-between">
                <Typography.Heading className="text-xl text-foreground">
                  Weigh-ins
                </Typography.Heading>
                <Text className="text-sm tabular-nums text-muted">{entries.length} total</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View className="items-center py-12">
              <Ionicons name="scale-outline" size={32} color={muted} />
              <Text className="mt-3 font-medium text-foreground">No weigh-ins yet</Text>
              <Text className="mt-1 text-sm text-muted">
                Add your first weight to start a trend.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${formatWeight(item.weightKg, DISPLAY_UNIT)} from ${formatDate(item.measuredAt)}`}
              onPress={() => openEntry(item)}
            >
              {({ pressed }) => (
                <Card className={`px-4 py-3.5 ${pressed ? "bg-surface-secondary" : ""}`}>
                  <Card.Body className="flex-row items-center justify-between">
                    <View>
                      <Text className="text-lg font-semibold tabular-nums text-foreground">
                        {formatWeight(item.weightKg, DISPLAY_UNIT)}
                      </Text>
                      <Text className="mt-0.5 text-sm text-muted">
                        {formatDate(item.measuredAt)}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      {index === 0 && (
                        <Text className="text-xs font-medium text-accent">Latest</Text>
                      )}
                      <Ionicons name="chevron-forward" size={18} color={muted} />
                    </View>
                  </Card.Body>
                </Card>
              )}
            </Pressable>
          )}
        />

        <Button
          className="absolute bottom-5 right-5 shadow-overlay"
          size="lg"
          isIconOnly
          accessibilityLabel="Add weigh-in"
          onPress={openNewEntry}
        >
          <Ionicons name="add" size={25} color={accentForeground} />
        </Button>
      </SafeAreaView>

      <Dialog.Portal>
        <Dialog.Overlay />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="w-full items-center"
        >
          <Dialog.Content className="w-96 p-5">
            <Dialog.Close className="absolute right-4 top-4 z-10" />
            <Dialog.Title>{editingEntry ? "Edit weigh-in" : "New weigh-in"}</Dialog.Title>
            <Dialog.Description className="mt-1">
              {editingEntry ? formatDate(editingEntry.measuredAt) : "Record your current weight."}
            </Dialog.Description>

            <TextField className="mt-5" isInvalid={Boolean(error)} isRequired>
              <Label>Weight ({DISPLAY_UNIT})</Label>
              <Input
                variant="secondary"
                value={weightInput}
                onChangeText={setWeightInput}
                placeholder={DISPLAY_UNIT === "kg" ? "75.0" : "165.3"}
                keyboardType="decimal-pad"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveEntry}
              />
              <Description>Weights are stored in kilograms.</Description>
              <FieldError>{error}</FieldError>
            </TextField>

            <View className="mt-6 gap-3">
              <Button onPress={saveEntry} isDisabled={saving || !weightInput.trim()}>
                {saving ? "Saving…" : editingEntry ? "Save changes" : "Add weigh-in"}
              </Button>
              {editingEntry && (
                <Button variant="danger-soft" onPress={deleteEntry} isDisabled={saving}>
                  Delete weigh-in
                </Button>
              )}
              <Button variant="ghost" onPress={() => setDialogOpen(false)} isDisabled={saving}>
                Cancel
              </Button>
            </View>
          </Dialog.Content>
        </KeyboardAvoidingView>
      </Dialog.Portal>
    </Dialog>
  );
}
