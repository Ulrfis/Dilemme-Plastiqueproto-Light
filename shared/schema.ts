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
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),

  // Questionnaire responses - Scénario (1-6)
  scenarioComprehension: integer("scenario_comprehension"),
  scenarioObjectives: integer("scenario_objectives"),
  scenarioClueLink: integer("scenario_clue_link"),

  // Questionnaire responses - Gameplay (1-6)
  gameplayExplanation: integer("gameplay_explanation"),
  gameplaySimplicity: integer("gameplay_simplicity"),
  gameplayBotResponses: integer("gameplay_bot_responses"),

  // Questionnaire responses - Feeling (1-6)
  feelingOriginality: integer("feeling_originality"),
  feelingPleasant: integer("feeling_pleasant"),
  feelingInteresting: integer("feeling_interesting"),

  // Questionnaire responses - Motivation (1-6)
  motivationContinue: integer("motivation_continue"),
  motivationGameplay: integer("motivation_gameplay"),
  motivationEcology: integer("motivation_ecology"),

  // Questionnaire responses - Interface (1-6)
  interfaceVisualBeauty: integer("interface_visual_beauty"),
  interfaceVisualClarity: integer("interface_visual_clarity"),
  interfaceVoiceChat: integer("interface_voice_chat"),

  // Questionnaire responses - Note globale (1-6)
  overallRating: integer("overall_rating"),

  // Questionnaire responses - Text field
  improvements: text("improvements"),

  // Questionnaire responses - Yes/No fields
  wantsUpdates: boolean("wants_updates").default(false),
  updateEmail: text("update_email"),
  wouldRecommend: boolean("would_recommend").default(false),
  wantsInSchool: boolean("wants_in_school").default(false),

  // Timestamp when questionnaire was completed
  feedbackCompletedAt: timestamp("feedback_completed_at"),
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
  startedAt: true,
});

export const insertConversationMessageSchema = createInsertSchema(conversationMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertTutorialSession = z.infer<typeof insertTutorialSessionSchema>;
export type TutorialSession = typeof tutorialSessions.$inferSelect;
export type InsertConversationMessage = z.infer<typeof insertConversationMessageSchema>;
export type ConversationMessage = typeof conversationMessages.$inferSelect;

// Feedback data type (for API compatibility)
export interface FeedbackData {
  sessionId: string;
  userName?: string;
  scenarioComprehension?: number;
  scenarioObjectives?: number;
  scenarioClueLink?: number;
  gameplayExplanation?: number;
  gameplaySimplicity?: number;
  gameplayBotResponses?: number;
  feelingOriginality?: number;
  feelingPleasant?: number;
  feelingInteresting?: number;
  motivationContinue?: number;
  motivationGameplay?: number;
  motivationEcology?: number;
  interfaceVisualBeauty?: number;
  interfaceVisualClarity?: number;
  interfaceVoiceChat?: number;
  overallRating?: number;
  improvements?: string;
  wantsUpdates?: boolean;
  updateEmail?: string;
  wouldRecommend?: boolean;
  wantsInSchool?: boolean;
}

// Keep feedback_surveys table for backward compatibility (can be removed later)
export const feedbackSurveys = pgTable("feedback_surveys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  userName: text("user_name"),
  scenarioComprehension: integer("scenario_comprehension"),
  scenarioObjectives: integer("scenario_objectives"),
  scenarioClueLink: integer("scenario_clue_link"),
  gameplayExplanation: integer("gameplay_explanation"),
  gameplaySimplicity: integer("gameplay_simplicity"),
  gameplayBotResponses: integer("gameplay_bot_responses"),
  feelingOriginality: integer("feeling_originality"),
  feelingPleasant: integer("feeling_pleasant"),
  feelingInteresting: integer("feeling_interesting"),
  motivationContinue: integer("motivation_continue"),
  motivationGameplay: integer("motivation_gameplay"),
  motivationEcology: integer("motivation_ecology"),
  interfaceVisualBeauty: integer("interface_visual_beauty"),
  interfaceVisualClarity: integer("interface_visual_clarity"),
  interfaceVoiceChat: integer("interface_voice_chat"),
  overallRating: integer("overall_rating"),
  improvements: text("improvements"),
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
