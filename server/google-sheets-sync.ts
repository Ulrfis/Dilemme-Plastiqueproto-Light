import { google } from 'googleapis';
import type { TutorialSession } from '@shared/schema';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Sheet not connected');
  }
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

export class GoogleSheetsSync {
  private initialized = false;

  async ensureHeaders(): Promise<void> {
    if (this.initialized) return;

    try {
      const sheets = await getGoogleSheetsClient();
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A1:I1',
      });

      const existingHeaders = response.data.values?.[0];
      
      if (!existingHeaders || existingHeaders.length === 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: 'Sheet1!A1:I1',
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
      
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A:I',
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
      
      console.log('[GoogleSheets] Session appended:', session.id);
    } catch (error) {
      console.error('[GoogleSheets] Failed to append session:', error);
    }
  }

  async updateSessionRow(sessionId: string, updates: Partial<TutorialSession>): Promise<void> {
    try {
      const sheets = await getGoogleSheetsClient();
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!B:B',
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
        range: `Sheet1!A${rowIndex}:I${rowIndex}`,
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
        range: `Sheet1!A${rowIndex}:I${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [updatedValues],
        },
      });
      
      console.log('[GoogleSheets] Session updated:', sessionId);
    } catch (error) {
      console.error('[GoogleSheets] Failed to update session:', error);
    }
  }
}

export const googleSheetsSync = new GoogleSheetsSync();
