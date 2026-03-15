import type { TutorialSession } from '@shared/schema';

// Google Apps Script Web App approach - works from any environment
// To set up:
// 1. Open https://docs.google.com/spreadsheets/d/1CisRjSfqNpcZGwmklqdIRc93hbK4-Pyu_ysoaT2Dfb4/edit
// 2. Go to Extensions > Apps Script
// 3. Paste the code from google-apps-script.js in this repo
// 4. Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone
// 5. Copy the URL and set it as GOOGLE_SCRIPT_URL environment variable

const SPREADSHEET_ID = '1CisRjSfqNpcZGwmklqdIRc93hbK4-Pyu_ysoaT2Dfb4';
const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz97fmNZdndQIWvlcfmKxsbQjb7aZC8F490pCqeuJ_GDO9u5WP8V9CVS-ozv4GPZFw/exec';

// Headers for unified session row (34 columns)
const UNIFIED_HEADERS = [
  'userName', 'sessionId', 'startedAt', 'completedAt', 'feedbackCompletedAt',
  'foundClues', 'clueCount', 'messageCount', 'finalSynthesis', 'upvotes',
  'audioMode', 'score',
  'scenarioComprehension', 'scenarioObjectives', 'scenarioClueLink',
  'gameplayExplanation', 'gameplaySimplicity', 'gameplayBotResponses', 'gameplayVoiceChat',
  'feelingOriginality', 'feelingPleasant', 'feelingInteresting',
  'motivationContinue', 'motivationGameplay', 'motivationEcology',
  'interfaceVisualBeauty', 'interfaceVisualClarity', 'interfaceVoiceChat',
  'overallRating', 'improvements',
  'wantsUpdates', 'updateEmail', 'wouldRecommend', 'wantsInSchool',
];

export class GoogleSheetsSync {
  private scriptUrl: string | null;

  constructor() {
    this.scriptUrl = process.env.GOOGLE_SCRIPT_URL || DEFAULT_SCRIPT_URL;
    if (this.scriptUrl) {
      console.log('[GoogleSheets] ✅ Google Apps Script URL configured');
    } else {
      console.warn('[GoogleSheets] ⚠️ GOOGLE_SCRIPT_URL not set - Google Sheets sync disabled. Set this env var with your deployed Apps Script URL.');
    }
  }

  sessionToRowData(session: TutorialSession): Record<string, any> {
    return {
      userName: session.userName,
      sessionId: session.id,
      startedAt: session.startedAt?.toISOString() || session.createdAt?.toISOString() || '',
      completedAt: session.completedAt?.toISOString() || '',
      feedbackCompletedAt: session.feedbackCompletedAt?.toISOString() || '',
      foundClues: JSON.stringify(session.foundClues || []),
      clueCount: (session.foundClues || []).length,
      messageCount: session.messageCount || 0,
      finalSynthesis: session.finalSynthesis || '',
      upvotes: session.upvotes || 0,
      audioMode: session.audioMode || 'voice',
      score: session.score || 0,
      scenarioComprehension: session.scenarioComprehension ?? '',
      scenarioObjectives: session.scenarioObjectives ?? '',
      scenarioClueLink: session.scenarioClueLink ?? '',
      gameplayExplanation: session.gameplayExplanation ?? '',
      gameplaySimplicity: session.gameplaySimplicity ?? '',
      gameplayBotResponses: session.gameplayBotResponses ?? '',
      gameplayVoiceChat: session.gameplayVoiceChat ?? '',
      feelingOriginality: session.feelingOriginality ?? '',
      feelingPleasant: session.feelingPleasant ?? '',
      feelingInteresting: session.feelingInteresting ?? '',
      motivationContinue: session.motivationContinue ?? '',
      motivationGameplay: session.motivationGameplay ?? '',
      motivationEcology: session.motivationEcology ?? '',
      interfaceVisualBeauty: session.interfaceVisualBeauty ?? '',
      interfaceVisualClarity: session.interfaceVisualClarity ?? '',
      interfaceVoiceChat: session.interfaceVoiceChat ?? '',
      overallRating: session.overallRating ?? '',
      improvements: session.improvements || '',
      wantsUpdates: session.feedbackCompletedAt ? (session.wantsUpdates ? 'Oui' : 'Non') : '',
      updateEmail: session.updateEmail || '',
      wouldRecommend: session.feedbackCompletedAt ? (session.wouldRecommend ? 'Oui' : 'Non') : '',
      wantsInSchool: session.feedbackCompletedAt ? (session.wantsInSchool ? 'Oui' : 'Non') : '',
    };
  }

  async upsertSessionRow(session: TutorialSession): Promise<void> {
    if (!this.scriptUrl) {
      console.warn('[GoogleSheets] Sync skipped - GOOGLE_SCRIPT_URL not configured');
      return;
    }

    try {
      const rowData = this.sessionToRowData(session);
      const payload = {
        action: 'upsert',
        spreadsheetId: SPREADSHEET_ID,
        headers: UNIFIED_HEADERS,
        sessionId: session.id,
        rowData,
      };

      console.log('[GoogleSheets] Sending upsert for session:', session.id, 'userName:', session.userName);

      const response = await fetch(this.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('[GoogleSheets] ❌ Apps Script error:', response.status, text);
        return;
      }

      const result = await response.json();
      if (result.success) {
        console.log('[GoogleSheets] ✅ Session synced:', session.id, result.action || '');
      } else {
        console.error('[GoogleSheets] ❌ Sync failed:', result.error);
      }
    } catch (error) {
      console.error('[GoogleSheets] ❌ Failed to sync session:', error);
    }
  }

  // Legacy methods for backward compatibility
  async appendSession(session: TutorialSession): Promise<void> {
    return this.upsertSessionRow(session);
  }

  async updateSessionRow(sessionId: string, updates: Partial<TutorialSession>): Promise<void> {
    console.log('[GoogleSheets] updateSessionRow called - redirecting to upsertSessionRow');
  }

  async appendFeedback(feedback: any): Promise<void> {
    console.log('[GoogleSheets] appendFeedback called - feedback is now stored in session row');
  }
}

export async function testGoogleSheetsConnection(): Promise<{ success: boolean; message: string; details?: any }> {
  const scriptUrl = process.env.GOOGLE_SCRIPT_URL || DEFAULT_SCRIPT_URL;
  if (!scriptUrl) {
    return {
      success: false,
      message: 'GOOGLE_SCRIPT_URL environment variable is not set',
      details: { hint: 'Deploy the Google Apps Script and set the URL as GOOGLE_SCRIPT_URL' },
    };
  }

  try {
    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test', spreadsheetId: SPREADSHEET_ID }),
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Apps Script returned HTTP ${response.status}`,
        details: { responseText: await response.text() },
      };
    }

    const result = await response.json();
    return {
      success: result.success === true,
      message: result.success ? 'Connection successful' : (result.error || 'Unknown error'),
      details: result,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Unknown error',
    };
  }
}

export const googleSheetsSync = new GoogleSheetsSync();
