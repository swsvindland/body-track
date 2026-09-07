import { createContext, useContext, useState, type ReactNode } from "react";
import { desc } from "drizzle-orm";
import { getLocales } from "expo-localization";
import { db, measurements, photos, preferences, weightEntries } from "@/db";
import type { Formula, Units } from "./metrics";
import { languages, type Language, translate } from "./translations";

function read() {
  const prefs = Object.fromEntries(
    db
      .select()
      .from(preferences)
      .all()
      .map((p) => [p.key, p.value])
  );
  const deviceLanguage = getLocales()[0]?.languageCode ?? "en";
  const language =
    (prefs.language ?? deviceLanguage) in languages
      ? ((prefs.language ?? deviceLanguage) as Language)
      : "en";
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
    units: (prefs.units ?? "metric") as Units,
    formula: (prefs.formula ?? "none") as Formula,
    language,
    lastSync: prefs.lastSync,
  };
}
type Store = ReturnType<typeof read> & {
  refresh: () => void;
  setPreference: (key: string, value: string) => void;
  t: (key: string) => string;
  number: (value: number, digits?: number) => string;
  date: (value: string) => string;
};
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState(read);
  const refresh = () => setData(read());
  const setPreference = (key: string, value: string) => {
    db.insert(preferences)
      .values({ key, value })
      .onConflictDoUpdate({ target: preferences.key, set: { value } })
      .run();
    refresh();
  };
  const locale = data.language === "zh" ? "zh-CN" : data.language;
  return (
    <Context.Provider
      value={{
        ...data,
        refresh,
        setPreference,
        t: (key) => translate(data.language, key),
        number: (value, digits = 1) =>
          new Intl.NumberFormat(locale, {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
          }).format(value),
        date: (value) =>
          new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString(locale, {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
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
