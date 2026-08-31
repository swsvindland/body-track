import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const counterLogs = sqliteTable("counter_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  count: integer("count").notNull(),
  date: text("date").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export type CounterLog = typeof counterLogs.$inferSelect;
