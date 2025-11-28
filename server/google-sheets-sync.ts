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

const SPREADSHEET_ID = '1CisRjSfqNpcZGwmklqdIRc93hbK4-Pyu_ysoaT2Dfb4';

// Cache pour le nom de la feuille
let cachedSheetName: string | null = null;

async function getFirstSheetName(): Promise<string> {
  if (cachedSheetName) {
    return cachedSheetName;
  }

  try {
    const sheets = await getGoogleSheetsClient();

    // Récupérer les métadonnées du spreadsheet pour obtenir le nom de la première feuille
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      fields: 'sheets.properties.title',
    });

    const firstSheet = spreadsheet.data.sheets?.[0];
    if (firstSheet?.properties?.title) {
      cachedSheetName = firstSheet.properties.title;
      console.log('[GoogleSheets] ✅ Found sheet name:', cachedSheetName);
      return cachedSheetName;
    }

    throw new Error('No sheets found in spreadsheet');
  } catch (error) {
    console.error('[GoogleSheets] ❌ Failed to get sheet name:', error);
    throw error;
  }
}

export class GoogleSheetsSync {
  private initialized = false;

  async ensureHeaders(): Promise<void> {
    if (this.initialized) return;

    try {
      const sheets = await getGoogleSheetsClient();
      const sheetName = await getFirstSheetName();

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheetName}'!A1:I1`,
      });

      const existingHeaders = response.data.values?.[0];

      if (!existingHeaders || existingHeaders.length === 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `'${sheetName}'!A1:I1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[
              'timestamp',
              'sessionId',
              'userName',
              'foundClues',
              'clueCount',
              'messageCount',
              'finalSynthesis',
              'upvotes',
              'completedAt'
            ]],
          },
        });
        console.log('[GoogleSheets] Headers created');
      }

      this.initialized = true;
    } catch (error) {
      console.error('[GoogleSheets] Failed to initialize headers:', error);
    }
  }

  async appendSession(session: TutorialSession): Promise<void> {
    try {
      await this.ensureHeaders();

      const sheets = await getGoogleSheetsClient();
      const sheetName = await getFirstSheetName();

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheetName}'!A:I`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            new Date().toISOString(),
            session.id,
            session.userName,
            JSON.stringify(session.foundClues),
            session.foundClues.length,
            session.messageCount,
            session.finalSynthesis || '',
            session.upvotes,
            session.completedAt?.toISOString() || '',
          ]],
        },
      });

      console.log('[GoogleSheets] ✅ Session appended:', session.id);
    } catch (error) {
      console.error('[GoogleSheets] ❌ Failed to append session:', error);
    }
  }

  async updateSessionRow(sessionId: string, updates: Partial<TutorialSession>): Promise<void> {
    try {
      const sheets = await getGoogleSheetsClient();
      const sheetName = await getFirstSheetName();

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheetName}'!B:B`,
      });

      const rows = response.data.values || [];
      let rowIndex = -1;

      for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === sessionId) {
          rowIndex = i + 1;
          break;
        }
      }

      if (rowIndex === -1) {
        console.log('[GoogleSheets] Session not found, skipping update:', sessionId);
        return;
      }

      const currentRow = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheetName}'!A${rowIndex}:I${rowIndex}`,
      });

      const currentValues = currentRow.data.values?.[0] || [];

      const updatedValues = [
        currentValues[0] || new Date().toISOString(),
        sessionId,
        updates.userName ?? currentValues[2] ?? '',
        updates.foundClues ? JSON.stringify(updates.foundClues) : currentValues[3] ?? '[]',
        updates.foundClues ? updates.foundClues.length : currentValues[4] ?? 0,
        updates.messageCount ?? currentValues[5] ?? 0,
        updates.finalSynthesis ?? currentValues[6] ?? '',
        updates.upvotes ?? currentValues[7] ?? 0,
        updates.completedAt?.toISOString() ?? currentValues[8] ?? '',
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheetName}'!A${rowIndex}:I${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [updatedValues],
        },
      });

      console.log('[GoogleSheets] ✅ Session updated:', sessionId);
    } catch (error) {
      console.error('[GoogleSheets] ❌ Failed to update session:', error);
    }
  }
}

export const googleSheetsSync = new GoogleSheetsSync();
