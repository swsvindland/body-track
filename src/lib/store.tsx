import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Uniwind } from "uniwind";
import { AppState } from "react-native";
import { configureHealthSchedule, syncHealthIfDue } from "./health-schedule";
import { desc, eq } from "drizzle-orm";
import { useLocales } from "expo-localization";
import { db, healthLinks, measurements, photos, preferences, weightEntries } from "@/db";
import { createFormat, localeTag } from "@/vector";
import type { Units } from "./metrics";
import {
  interpolate,
  isMessage,
  languagePreference,
  resolveLanguage,
  translate,
  type Language,
  type Message,
} from "./translations";

function read() {
  const prefs = Object.fromEntries(
    db
      .select()
      .from(preferences)
      .all()
      .map((p) => [p.key, p.value])
  );
  // health-schedule stores the failure as a translation key.
  const storedError = prefs.healthSyncError ?? "";
  const healthSyncError: Message | "" = isMessage(storedError) ? storedError : "";
  return {
    weights: db
      .select()
      .from(weightEntries)
      .orderBy(desc(weightEntries.measuredAt), desc(weightEntries.id))
      .all(),
    measurements: db
      .select()
      .from(measurements)
      .orderBy(desc(measurements.measuredAt), desc(measurements.id))
      .all(),
    photos: db.select().from(photos).orderBy(desc(photos.measuredAt), desc(photos.id)).all(),
    /** Records imported from Apple Health or Health Connect, as "weight:12": managed there, never edited here. */
    healthImports: new Set(
      db
        .select({ kind: healthLinks.localKind, id: healthLinks.localId })
        .from(healthLinks)
        .where(eq(healthLinks.origin, "health"))
        .all()
        .map((link) => `${link.kind}:${link.id}`)
    ),
    units: (prefs.units ?? "metric") as Units,
    formula: (prefs.formula === "female" ? "female" : "male") as "male" | "female",
    theme: (prefs.theme === "dark" || prefs.theme === "light" ? prefs.theme : "system") as
      "dark" | "light" | "system",
    healthSyncEnabled: prefs.healthSyncEnabled === "true",
    healthSyncError,
    languagePreference: languagePreference(prefs.language),
    lastSync: prefs.lastSync,
  };
}
type Store = ReturnType<typeof read> & {
  language: Language;
  refresh: () => void;
  setPreference: (key: string, value: string) => void;
  t: (key: Message, values?: Record<string, string | number>) => string;
  date: (value: string) => string;
};
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState(read);
  const locales = useLocales();
  const language = resolveLanguage(data.languagePreference, locales[0]?.languageCode);
  useEffect(() => {
    Uniwind.setTheme(data.theme);
  }, [data.theme]);
  useEffect(() => {
    let active = true;
    const check = async () => {
      if (AppState.currentState !== "active") return;
      try {
        await syncHealthIfDue();
      } finally {
        if (active) setData(read());
      }
    };
    void configureHealthSchedule()
      .catch(() => {})
      .finally(check);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    const timer = setInterval(() => void check(), 60 * 60 * 1000);
    return () => {
      active = false;
      subscription.remove();
      clearInterval(timer);
    };
  }, [data.healthSyncEnabled]);
  const refresh = () => setData(read());
  const setPreference = (key: string, value: string) => {
    db.insert(preferences)
      .values({ key, value })
      .onConflictDoUpdate({ target: preferences.key, set: { value } })
      .run();
    refresh();
  };
  // The kit's tag and formatter (VectorProvider builds the same one), so these dates match DateInput and the charts.
  const format = createFormat(localeTag(language, locales));
  return (
    <Context.Provider
      value={{
        ...data,
        language,
        refresh,
        setPreference,
        t: (key, values) =>
          values ? interpolate(translate(language, key), values) : translate(language, key),
        date: (value) => format.date(new Date(value.length === 10 ? `${value}T12:00:00` : value)),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStore() {
  const value = useContext(Context);
  if (!value) throw new Error("StoreProvider is required");
  return value;
}
