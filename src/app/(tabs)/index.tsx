import { desc } from "drizzle-orm";
import { Button, Card, Typography, useThemeColor } from "heroui-native";
import { useEffect, useState, type JSX } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { db, counterLogs, type CounterLog } from "@/db";

export default function HomeTab(): JSX.Element {
  const [count, setCount] = useState<number>(0);
  const [history, setHistory] = useState<CounterLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const themeForeground = useThemeColor("foreground");

  const refreshData = async () => {
    try {
      const records = await db.select().from(counterLogs).orderBy(desc(counterLogs.id)).limit(20);

      setHistory(records);
      if (records.length > 0) {
        setCount(records[0].count);
      } else {
        setCount(0);
      }
    } catch (err) {
      console.error("Failed to refresh counter data from sqlite:", err);
    }
  };

  useEffect(() => {
    let isMounted = true;

    db.select()
      .from(counterLogs)
      .orderBy(desc(counterLogs.id))
      .limit(20)
      .then((records) => {
        if (!isMounted) return;
        setHistory(records);
        if (records.length > 0) {
          setCount(records[0].count);
        } else {
          setCount(0);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Failed to load counter data from sqlite:", err);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const updateCount = async (newCount: number) => {
    setSaving(true);
    try {
      const now = new Date();
      await db.insert(counterLogs).values({
        count: newCount,
        date: now.toISOString(),
      });
      await refreshData();
    } catch (err) {
      console.error("Failed to save counter to sqlite:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleIncrement = () => updateCount(count + 1);
  const handleDecrement = () => updateCount(count - 1);
  const handleReset = () => updateCount(0);

  const handleClearHistory = async () => {
    setSaving(true);
    try {
      await db.delete(counterLogs);
      setCount(0);
      setHistory([]);
    } catch (err) {
      console.error("Failed to clear counter logs:", err);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color={themeForeground} />
        <Typography.Paragraph className="mt-3 text-muted-foreground">
          Loading SQLite Database...
        </Typography.Paragraph>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        ListHeaderComponent={
          <View className="gap-5 mb-5">
            <View className="items-center mt-2">
              <Typography.Paragraph className="text-2xl font-bold text-foreground">
                SQLite Counter
              </Typography.Paragraph>
              <Typography.Paragraph className="text-sm text-muted-foreground text-center mt-1">
                Persisted locally using Expo SQLite & Drizzle ORM
              </Typography.Paragraph>
            </View>

            <Card className="items-center py-6 px-4 gap-4 bg-card border border-border rounded-2xl shadow-sm">
              <Typography.Paragraph className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Current Value
              </Typography.Paragraph>
              <Text className="text-6xl font-extrabold text-foreground">{count}</Text>

              <View className="flex-row items-center justify-center gap-3 w-full mt-2">
                <Button
                  className="flex-1 bg-muted"
                  variant="secondary"
                  isDisabled={saving}
                  onPress={handleDecrement}
                >
                  -1
                </Button>
                <Button className="flex-1 bg-primary" isDisabled={saving} onPress={handleIncrement}>
                  +1
                </Button>
              </View>

              <View className="flex-row items-center justify-center gap-3 w-full">
                <Button
                  className="flex-1"
                  variant="outline"
                  size="sm"
                  isDisabled={saving}
                  onPress={handleReset}
                >
                  Reset (0)
                </Button>
                {history.length > 0 && (
                  <Button
                    className="flex-1"
                    variant="ghost"
                    size="sm"
                    isDisabled={saving}
                    onPress={handleClearHistory}
                  >
                    Clear History
                  </Button>
                )}
              </View>
            </Card>

            <View className="flex-row items-center justify-between pt-2">
              <Typography.Paragraph className="font-semibold text-foreground text-base">
                Database Entries ({history.length})
              </Typography.Paragraph>
              {saving && <ActivityIndicator size="small" color={themeForeground} />}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View className="py-8 items-center justify-center border border-dashed border-border rounded-xl">
            <Typography.Paragraph className="text-muted-foreground text-sm">
              No entries stored yet. Tap +1 or -1 to record into SQLite.
            </Typography.Paragraph>
          </View>
        }
        renderItem={({ item, index }) => (
          <View className="flex-row items-center justify-between p-3.5 mb-2 bg-card border border-border rounded-xl">
            <View className="flex-row items-center gap-3">
              <View className="w-8 h-8 rounded-full bg-muted items-center justify-center">
                <Text className="text-xs font-semibold text-foreground">#{item.id}</Text>
              </View>
              <View>
                <Text className="text-sm font-semibold text-foreground">Count: {item.count}</Text>
                <Text className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(item.date)}
                </Text>
              </View>
            </View>
            {index === 0 && (
              <View className="px-2 py-0.5 bg-primary/10 rounded-full">
                <Text className="text-xs font-medium text-primary">Latest</Text>
              </View>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}
