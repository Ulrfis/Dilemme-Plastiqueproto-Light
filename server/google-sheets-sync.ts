import { google } from 'googleapis';
import type { TutorialSession } from '@shared/schema';

let connectionSettings: any;

async function getAccessToken() {
  console.log('[GoogleSheets] Getting access token...');

  if (connectionSettings && connectionSettings.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    console.log('[GoogleSheets] Using cached token');
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  console.log('[GoogleSheets] REPLIT_CONNECTORS_HOSTNAME:', hostname ? 'SET' : 'NOT SET');

  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  console.log('[GoogleSheets] Token type:', process.env.REPL_IDENTITY ? 'REPL_IDENTITY' : process.env.WEB_REPL_RENEWAL ? 'WEB_REPL_RENEWAL' : 'NONE');

  if (!hostname) {
    console.error('[GoogleSheets] ❌ REPLIT_CONNECTORS_HOSTNAME is not set - Google Sheets sync disabled');
    throw new Error('REPLIT_CONNECTORS_HOSTNAME not set - Are you running on Replit?');
  }

  if (!xReplitToken) {
    console.error('[GoogleSheets] ❌ X_REPLIT_TOKEN not found');
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  try {
    const url = 'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet';
    console.log('[GoogleSheets] Fetching connection from:', url);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    });

    if (!response.ok) {
      console.error('[GoogleSheets] ❌ Connector API error:', response.status, response.statusText);
      throw new Error(`Connector API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[GoogleSheets] Connector response items:', data.items?.length || 0);

    connectionSettings = data.items?.[0];

    if (!connectionSettings) {
      console.error('[GoogleSheets] ❌ No Google Sheet connector found. Please connect Google Sheets in Replit.');
      throw new Error('No Google Sheet connector found');
    }

    console.log('[GoogleSheets] Connector found:', connectionSettings.connector_name);
  } catch (fetchError) {
    console.error('[GoogleSheets] ❌ Failed to fetch connector:', fetchError);
    throw fetchError;
  }

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!accessToken) {
    console.error('[GoogleSheets] ❌ No access token in connector settings');
    console.error('[GoogleSheets] Available settings keys:', Object.keys(connectionSettings?.settings || {}));
    throw new Error('Google Sheet access token not found');
  }

  console.log('[GoogleSheets] ✅ Access token obtained');
  return accessToken;
}

async function getGoogleSheetsClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

let cachedSpreadsheetId: string | null = null;

async function getSpreadsheetId(): Promise<string> {
  if (cachedSpreadsheetId) {
    return cachedSpreadsheetId;
  }

  if (connectionSettings?.settings?.spreadsheet_id) {
    cachedSpreadsheetId = connectionSettings.settings.spreadsheet_id;
    console.log('[GoogleSheets] ✅ Using spreadsheet ID from connector:', cachedSpreadsheetId);
    return cachedSpreadsheetId;
  }

  cachedSpreadsheetId = '1CisRjSfqNpcZGwmklqdIRc93hbK4-Pyu_ysoaT2Dfb4';
  console.log('[GoogleSheets] Using hardcoded spreadsheet ID:', cachedSpreadsheetId);
  return cachedSpreadsheetId;
}

let cachedSheetName: string | null = null;

async function getFirstSheetName(): Promise<string> {
  if (cachedSheetName) {
    return cachedSheetName;
  }

  try {
    const sheets = await getGoogleSheetsClient();
    const spreadsheetId = await getSpreadsheetId();

    console.log('[GoogleSheets] Getting sheet names from spreadsheet:', spreadsheetId);

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId,
      fields: 'sheets.properties.title',
    });

    console.log('[GoogleSheets] Spreadsheet response:', JSON.stringify(spreadsheet.data.sheets));

    const firstSheet = spreadsheet.data.sheets?.[0];
    if (firstSheet?.properties?.title) {
      cachedSheetName = firstSheet.properties.title;
      console.log('[GoogleSheets] ✅ Found sheet name:', cachedSheetName);
      return cachedSheetName;
    }

    throw new Error('No sheets found in spreadsheet');
  } catch (error: any) {
    console.error('[GoogleSheets] ❌ Failed to get sheet name:', error?.message || error);
    console.error('[GoogleSheets] Full error:', JSON.stringify(error?.response?.data || error, null, 2));
    throw error;
  }
}

export async function testGoogleSheetsConnection(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    console.log('[GoogleSheets] === TEST CONNECTION START ===');

    const accessToken = await getAccessToken();
    console.log('[GoogleSheets] Step 1: Access token obtained');

    console.log('[GoogleSheets] Step 2: Connector settings:', JSON.stringify(connectionSettings?.settings || {}, null, 2));

    const spreadsheetId = await getSpreadsheetId();
    console.log('[GoogleSheets] Step 3: Spreadsheet ID:', spreadsheetId);

    const sheets = await getGoogleSheetsClient();
    console.log('[GoogleSheets] Step 4: Sheets client created');

    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId,
    });
    console.log('[GoogleSheets] Step 5: Spreadsheet title:', metadata.data.properties?.title);
    console.log('[GoogleSheets] Step 5: Sheets:', metadata.data.sheets?.map(s => s.properties?.title));

    const sheetName = await getFirstSheetName();
    console.log('[GoogleSheets] Step 6: Using sheet:', sheetName);

    const testRead = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: `'${sheetName}'!A1`,
    });
    console.log('[GoogleSheets] Step 7: Read test successful, A1 value:', testRead.data.values);

    console.log('[GoogleSheets] === TEST CONNECTION SUCCESS ===');

    return {
      success: true,
      message: 'Connection successful',
      details: {
        spreadsheetId,
        spreadsheetTitle: metadata.data.properties?.title,
        sheetName,
        sheetCount: metadata.data.sheets?.length,
        allSheets: metadata.data.sheets?.map(s => s.properties?.title),
      }
    };
  } catch (error: any) {
    console.error('[GoogleSheets] === TEST CONNECTION FAILED ===');
    console.error('[GoogleSheets] Error:', error?.message || error);

    return {
      success: false,
      message: error?.message || 'Unknown error',
      details: {
        errorCode: error?.code,
        errorStatus: error?.status,
        errors: error?.errors,
      }
    };
  }
}

// Headers for unified session row (35 columns)
const UNIFIED_HEADERS = [
  // Session info (1-12)
  'userName',           // A - Nom de l'utilisateur (clé principale)
  'sessionId',          // B
  'startedAt',          // C - Début de l'expérience
  'completedAt',        // D - Fin de l'expérience (4 indices trouvés)
  'feedbackCompletedAt', // E - Fin du questionnaire
  'foundClues',         // F - Liste des indices trouvés
  'clueCount',          // G - Nombre d'indices
  'messageCount',       // H - Nombre de messages
  'finalSynthesis',     // I - Phrase de synthèse
  'upvotes',            // J - Votes
  'audioMode',          // K - Mode audio (voice/text)
  'score',              // L - Score
  
  // Questionnaire - Scénario (13-15)
  'scenarioComprehension', // M
  'scenarioObjectives',    // N
  'scenarioClueLink',      // O
  
  // Questionnaire - Gameplay (16-19)
  'gameplayExplanation',   // P
  'gameplaySimplicity',    // Q
  'gameplayBotResponses',  // R
  'gameplayVoiceChat',     // S
  
  // Questionnaire - Feeling (20-22)
  'feelingOriginality',    // T
  'feelingPleasant',       // U
  'feelingInteresting',    // V
  
  // Questionnaire - Motivation (23-25)
  'motivationContinue',    // W
  'motivationGameplay',    // X
  'motivationEcology',     // Y
  
  // Questionnaire - Interface (26-28)
  'interfaceVisualBeauty', // Z
  'interfaceVisualClarity', // AA
  'interfaceVoiceChat',    // AB
  
  // Questionnaire - Note globale (29)
  'overallRating',         // AC
  
  // Questionnaire - Texte (30)
  'improvements',          // AD
  
  // Questionnaire - Oui/Non (31-34)
  'wantsUpdates',          // AE
  'updateEmail',           // AF
  'wouldRecommend',        // AG
  'wantsInSchool',         // AH
];

export class GoogleSheetsSync {
  private initialized = false;

  async ensureUnifiedHeaders(): Promise<void> {
    if (this.initialized) return;

    try {
      const sheets = await getGoogleSheetsClient();
      const spreadsheetId = await getSpreadsheetId();
      const sheetName = await getFirstSheetName();

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: `'${sheetName}'!A1:AH1`,
      });

      const existingHeaders = response.data.values?.[0];

      if (!existingHeaders || existingHeaders.length === 0 || existingHeaders[0] !== 'userName') {
        await sheets.spreadsheets.values.update({
          spreadsheetId: spreadsheetId,
          range: `'${sheetName}'!A1:AH1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [UNIFIED_HEADERS],
          },
        });
        console.log('[GoogleSheets] ✅ Unified headers created (34 columns)');
      }

      this.initialized = true;
    } catch (error) {
      console.error('[GoogleSheets] Failed to initialize headers:', error);
    }
  }

  sessionToRowValues(session: TutorialSession): any[] {
    return [
      // Session info
      session.userName,
      session.id,
      session.startedAt?.toISOString() || session.createdAt?.toISOString() || '',
      session.completedAt?.toISOString() || '',
      session.feedbackCompletedAt?.toISOString() || '',
      JSON.stringify(session.foundClues || []),
      (session.foundClues || []).length,
      session.messageCount || 0,
      session.finalSynthesis || '',
      session.upvotes || 0,
      session.audioMode || 'voice',
      session.score || 0,
      
      // Questionnaire - Scénario
      session.scenarioComprehension ?? '',
      session.scenarioObjectives ?? '',
      session.scenarioClueLink ?? '',
      
      // Questionnaire - Gameplay
      session.gameplayExplanation ?? '',
      session.gameplaySimplicity ?? '',
      session.gameplayBotResponses ?? '',
      session.gameplayVoiceChat ?? '',
      
      // Questionnaire - Feeling
      session.feelingOriginality ?? '',
      session.feelingPleasant ?? '',
      session.feelingInteresting ?? '',
      
      // Questionnaire - Motivation
      session.motivationContinue ?? '',
      session.motivationGameplay ?? '',
      session.motivationEcology ?? '',
      
      // Questionnaire - Interface
      session.interfaceVisualBeauty ?? '',
      session.interfaceVisualClarity ?? '',
      session.interfaceVoiceChat ?? '',
      
      // Questionnaire - Note globale
      session.overallRating ?? '',
      
      // Questionnaire - Texte
      session.improvements || '',
      
      // Questionnaire - Oui/Non (only show value if feedbackCompletedAt is set)
      session.feedbackCompletedAt ? (session.wantsUpdates ? 'Oui' : 'Non') : '',
      session.updateEmail || '',
      session.feedbackCompletedAt ? (session.wouldRecommend ? 'Oui' : 'Non') : '',
      session.feedbackCompletedAt ? (session.wantsInSchool ? 'Oui' : 'Non') : '',
    ];
  }

  async upsertSessionRow(session: TutorialSession): Promise<void> {
    try {
      await this.ensureUnifiedHeaders();

      const sheets = await getGoogleSheetsClient();
      const spreadsheetId = await getSpreadsheetId();
      const sheetName = await getFirstSheetName();

      // Find existing row by sessionId (column B)
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: `'${sheetName}'!B:B`,
      });

      const rows = response.data.values || [];
      let rowIndex = -1;

      for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === session.id) {
          rowIndex = i + 1;
          break;
        }
      }

      const rowValues = this.sessionToRowValues(session);

      if (rowIndex === -1) {
        // Insert new row
        await sheets.spreadsheets.values.append({
          spreadsheetId: spreadsheetId,
          range: `'${sheetName}'!A:AH`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [rowValues],
          },
        });
        console.log('[GoogleSheets] ✅ Session inserted:', session.id, 'userName:', session.userName);
      } else {
        // Update existing row
        await sheets.spreadsheets.values.update({
          spreadsheetId: spreadsheetId,
          range: `'${sheetName}'!A${rowIndex}:AH${rowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [rowValues],
          },
        });
        console.log('[GoogleSheets] ✅ Session updated:', session.id, 'userName:', session.userName);
      }
    } catch (error) {
      console.error('[GoogleSheets] ❌ Failed to upsert session:', error);
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

export const googleSheetsSync = new GoogleSheetsSync();
