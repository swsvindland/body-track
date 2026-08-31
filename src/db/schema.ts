import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const counterLogs = sqliteTable("counter_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  count: integer("count").notNull(),
  date: text("date").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export type CounterLog = typeof counterLogs.$inferSelect;

export const weightEntries = sqliteTable("weight_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weightKg: real("weight_kg").notNull(),
  measuredAt: text("measured_at").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export type WeightEntry = typeof weightEntries.$inferSelect;
