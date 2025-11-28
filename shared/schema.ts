import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
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
  finalSynthesis: text("final_synthesis"),
  messageCount: integer("message_count").default(0).notNull(),
  upvotes: integer("upvotes").default(0).notNull(),
  completedAt: timestamp("completed_at"),
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

// Feedback survey table
export const feedbackSurveys = pgTable("feedback_surveys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  userName: text("user_name"),

  // Scénario (1-6)
  scenarioComprehension: integer("scenario_comprehension"),
  scenarioObjectives: integer("scenario_objectives"),
  scenarioClueLink: integer("scenario_clue_link"),

  // Gameplay (1-6)
  gameplayExplanation: integer("gameplay_explanation"),
  gameplaySimplicity: integer("gameplay_simplicity"),
  gameplayBotResponses: integer("gameplay_bot_responses"),

  // Feeling (1-6)
  feelingOriginality: integer("feeling_originality"),
  feelingPleasant: integer("feeling_pleasant"),
  feelingInteresting: integer("feeling_interesting"),

  // Motivation (1-6)
  motivationContinue: integer("motivation_continue"),
  motivationGameplay: integer("motivation_gameplay"),
  motivationEcology: integer("motivation_ecology"),

  // Interface (1-6)
  interfaceVisualBeauty: integer("interface_visual_beauty"),
  interfaceVisualClarity: integer("interface_visual_clarity"),
  interfaceVoiceChat: integer("interface_voice_chat"),

  // Note globale (1-6)
  overallRating: integer("overall_rating"),

  // Text field
  improvements: text("improvements"),

  // Yes/No fields
  wantsUpdates: boolean("wants_updates").default(false),
  updateEmail: text("update_email"),
  wouldRecommend: boolean("would_recommend").default(false),
  wantsInSchool: boolean("wants_in_school").default(false),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFeedbackSurveySchema = createInsertSchema(feedbackSurveys).omit({
  id: true,
  createdAt: true,
});

export type InsertFeedbackSurvey = z.infer<typeof insertFeedbackSurveySchema>;
export type FeedbackSurvey = typeof feedbackSurveys.$inferSelect;
