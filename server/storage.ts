import { 
  type TutorialSession, 
  type InsertTutorialSession,
  type ConversationMessage,
  type InsertConversationMessage
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  createSession(session: InsertTutorialSession): Promise<TutorialSession>;
  getSession(id: string): Promise<TutorialSession | undefined>;
  updateSession(id: string, updates: Partial<TutorialSession>): Promise<TutorialSession | undefined>;
  addMessage(message: InsertConversationMessage): Promise<ConversationMessage>;
  getSessionMessages(sessionId: string): Promise<ConversationMessage[]>;
}

export class MemStorage implements IStorage {
  private sessions: Map<string, TutorialSession>;
  private messages: Map<string, ConversationMessage>;

  constructor() {
    this.sessions = new Map();
    this.messages = new Map();
  }

  async createSession(insertSession: InsertTutorialSession): Promise<TutorialSession> {
    const id = randomUUID();
    const session: TutorialSession = {
      id,
      userName: insertSession.userName,
      foundClues: (insertSession.foundClues || []) as string[],
      score: insertSession.score || 0,
      audioMode: (insertSession.audioMode || 'voice') as 'voice' | 'text',
      completed: insertSession.completed || 0,
      threadId: null,
      createdAt: new Date(),
    };
    this.sessions.set(id, session);
    return session;
  }

  async getSession(id: string): Promise<TutorialSession | undefined> {
    return this.sessions.get(id);
  }

  async updateSession(id: string, updates: Partial<TutorialSession>): Promise<TutorialSession | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    const updated: TutorialSession = {
      ...session,
      userName: updates.userName !== undefined ? updates.userName : session.userName,
      foundClues: updates.foundClues !== undefined ? updates.foundClues as string[] : session.foundClues,
      score: updates.score !== undefined ? updates.score : session.score,
      audioMode: updates.audioMode !== undefined ? updates.audioMode as 'voice' | 'text' : session.audioMode,
      completed: updates.completed !== undefined ? updates.completed : session.completed,
      threadId: updates.threadId !== undefined ? updates.threadId : session.threadId,
    };
    this.sessions.set(id, updated);
    return updated;
  }

  async addMessage(insertMessage: InsertConversationMessage): Promise<ConversationMessage> {
    const id = randomUUID();
    const message: ConversationMessage = {
      id,
      sessionId: insertMessage.sessionId,
      role: insertMessage.role as 'user' | 'assistant',
      content: insertMessage.content,
      detectedClue: insertMessage.detectedClue || null,
      createdAt: new Date(),
    };
    this.messages.set(id, message);
    return message;
  }

  async getSessionMessages(sessionId: string): Promise<ConversationMessage[]> {
    return Array.from(this.messages.values())
      .filter(msg => msg.sessionId === sessionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

export const storage = new MemStorage();
