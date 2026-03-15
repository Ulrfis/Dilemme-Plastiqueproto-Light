/**
 * Google Apps Script - Web App for Dilemme Plastique Google Sheets sync
 *
 * INSTALLATION:
 * 1. Ouvrir le Google Sheet: https://docs.google.com/spreadsheets/d/1CisRjSfqNpcZGwmklqdIRc93hbK4-Pyu_ysoaT2Dfb4/edit
 * 2. Extensions > Apps Script
 * 3. Supprimer le contenu par défaut et coller ce code
 * 4. Cliquer "Déployer" > "Nouveau déploiement"
 * 5. Type: "Application Web"
 * 6. Exécuter en tant que: "Moi"
 * 7. Qui a accès: "Tout le monde"
 * 8. Cliquer "Déployer" et autoriser l'accès
 * 9. Copier l'URL du déploiement
 * 10. Ajouter l'URL comme variable d'environnement GOOGLE_SCRIPT_URL sur le serveur
 */

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;

    if (action === 'test') {
      return jsonResponse({ success: true, message: 'Connection OK', timestamp: new Date().toISOString() });
    }

    if (action === 'upsert') {
      return handleUpsert(payload);
    }

    return jsonResponse({ success: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function handleUpsert(payload) {
  var spreadsheetId = payload.spreadsheetId;
  var headers = payload.headers;
  var sessionId = payload.sessionId;
  var rowData = payload.rowData;

  if (!spreadsheetId || !sessionId || !rowData) {
    return jsonResponse({ success: false, error: 'Missing required fields' });
  }

  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheets()[0];

  // Ensure headers exist in row 1
  var existingHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (!existingHeaders[0] || existingHeaders[0] !== headers[0]) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  // Build row values from rowData following headers order
  var rowValues = headers.map(function(h) {
    return rowData[h] !== undefined && rowData[h] !== null ? rowData[h] : '';
  });

  // Find existing row by sessionId (column B = index 2)
  var sessionIdCol = headers.indexOf('sessionId') + 1; // 1-based
  if (sessionIdCol < 1) sessionIdCol = 2; // default to column B

  var lastRow = sheet.getLastRow();
  var existingRow = -1;

  if (lastRow > 1) {
    var sessionIds = sheet.getRange(2, sessionIdCol, lastRow - 1, 1).getValues();
    for (var i = 0; i < sessionIds.length; i++) {
      if (sessionIds[i][0] === sessionId) {
        existingRow = i + 2; // +2 because data starts at row 2, array is 0-indexed
        break;
      }
    }
  }

  if (existingRow > 0) {
    // Update existing row
    sheet.getRange(existingRow, 1, 1, rowValues.length).setValues([rowValues]);
    return jsonResponse({ success: true, action: 'updated', row: existingRow });
  } else {
    // Append new row
    sheet.appendRow(rowValues);
    return jsonResponse({ success: true, action: 'inserted', row: sheet.getLastRow() });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Handle GET requests (for testing in browser)
function doGet(e) {
  return jsonResponse({
    success: true,
    message: 'Dilemme Plastique Sheets Sync is active',
    timestamp: new Date().toISOString()
  });
}
