import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const tutorialSessions = pgTable("tutorial_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userName: text("user_name").notNull(),
  foundClues: jsonb("found_clues").$type<string[]>().default([]).notNull(),
  score: integer("score").default(0).notNull(),
  audioMode: text("audio_mode").$type<'voice' | 'text'>().default('voice').notNull(),
  completed: integer("completed").default(0).notNull(),
  threadId: text("thread_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversationMessages = pgTable("conversation_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  role: text("role").$type<'user' | 'assistant'>().notNull(),
  content: text("content").notNull(),
  detectedClue: text("detected_clue"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTutorialSessionSchema = createInsertSchema(tutorialSessions).omit({
  id: true,
  createdAt: true,
});

export const insertConversationMessageSchema = createInsertSchema(conversationMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertTutorialSession = z.infer<typeof insertTutorialSessionSchema>;
export type TutorialSession = typeof tutorialSessions.$inferSelect;
export type InsertConversationMessage = z.infer<typeof insertConversationMessageSchema>;
export type ConversationMessage = typeof conversationMessages.$inferSelect;
