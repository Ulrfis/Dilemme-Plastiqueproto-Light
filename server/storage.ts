import { 
  tutorialSessions,
  conversationMessages,
  type TutorialSession, 
  type InsertTutorialSession,
  type ConversationMessage,
  type InsertConversationMessage
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";
import { googleSheetsSync } from "./google-sheets-sync";

export interface IStorage {
  createSession(session: InsertTutorialSession): Promise<TutorialSession>;
  getSession(id: string): Promise<TutorialSession | undefined>;
  updateSession(id: string, updates: Partial<TutorialSession>): Promise<TutorialSession | undefined>;
  addMessage(message: InsertConversationMessage): Promise<ConversationMessage>;
  getSessionMessages(sessionId: string): Promise<ConversationMessage[]>;
  getCompletedSessions(options: { sort: 'recent' | 'upvotes', limit: number }): Promise<TutorialSession[]>;
  incrementUpvote(id: string): Promise<TutorialSession | undefined>;
  incrementMessageCount(sessionId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async createSession(insertSession: InsertTutorialSession): Promise<TutorialSession> {
    const [session] = await db
      .insert(tutorialSessions)
      .values(insertSession)
      .returning();

    googleSheetsSync.appendSession(session).catch(console.error);

    return session;
  }

  async getSession(id: string): Promise<TutorialSession | undefined> {
    const [session] = await db
      .select()
      .from(tutorialSessions)
      .where(eq(tutorialSessions.id, id));
    return session || undefined;
  }

  async updateSession(id: string, updates: Partial<TutorialSession>): Promise<TutorialSession | undefined> {
    const updateData: any = {};
    
    if (updates.userName !== undefined) updateData.userName = updates.userName;
    if (updates.foundClues !== undefined) updateData.foundClues = updates.foundClues;
    if (updates.score !== undefined) updateData.score = updates.score;
    if (updates.audioMode !== undefined) updateData.audioMode = updates.audioMode;
    if (updates.completed !== undefined) updateData.completed = updates.completed;
    if (updates.threadId !== undefined) updateData.threadId = updates.threadId;
    if (updates.finalSynthesis !== undefined) updateData.finalSynthesis = updates.finalSynthesis;
    if (updates.messageCount !== undefined) updateData.messageCount = updates.messageCount;
    if (updates.upvotes !== undefined) updateData.upvotes = updates.upvotes;
    if (updates.completedAt !== undefined) updateData.completedAt = updates.completedAt;

    if (Object.keys(updateData).length === 0) {
      return this.getSession(id);
    }

    const [session] = await db
      .update(tutorialSessions)
      .set(updateData)
      .where(eq(tutorialSessions.id, id))
      .returning();

    if (session) {
      googleSheetsSync.updateSessionRow(id, updates).catch(console.error);
    }

    return session || undefined;
  }

  async addMessage(insertMessage: InsertConversationMessage): Promise<ConversationMessage> {
    const [message] = await db
      .insert(conversationMessages)
      .values(insertMessage)
      .returning();

    return message;
  }

  async getSessionMessages(sessionId: string): Promise<ConversationMessage[]> {
    return db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.sessionId, sessionId))
      .orderBy(conversationMessages.createdAt);
  }

  async getCompletedSessions(options: { sort: 'recent' | 'upvotes', limit: number }): Promise<TutorialSession[]> {
    const orderBy = options.sort === 'upvotes' 
      ? desc(tutorialSessions.upvotes)
      : desc(tutorialSessions.completedAt);

    return db
      .select()
      .from(tutorialSessions)
      .where(eq(tutorialSessions.completed, 1))
      .orderBy(orderBy)
      .limit(options.limit);
  }

  async incrementUpvote(id: string): Promise<TutorialSession | undefined> {
    const [session] = await db
      .update(tutorialSessions)
      .set({
        upvotes: sql`${tutorialSessions.upvotes} + 1`
      })
      .where(eq(tutorialSessions.id, id))
      .returning();

    if (session) {
      googleSheetsSync.updateSessionRow(id, { upvotes: session.upvotes }).catch(console.error);
    }

    return session || undefined;
  }

  async incrementMessageCount(sessionId: string): Promise<void> {
    await db
      .update(tutorialSessions)
      .set({
        messageCount: sql`${tutorialSessions.messageCount} + 1`
      })
      .where(eq(tutorialSessions.id, sessionId));
  }
}

export const storage = new DatabaseStorage();
