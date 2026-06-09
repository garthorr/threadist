/**
 * Storage Logic using Google Sheets
 *
 * Columns:
 * 0: gmail_account
 * 1: gmail_thread_id
 * 2: gmail_message_id
 * 3: gmail_subject
 * 4: gmail_sender
 * 5: gmail_url
 * 6: todoist_task_id
 * 7: todoist_task_title
 * 8: todoist_project_name
 * 9: linked_at
 */

const STORAGE_SHEET_NAME = 'ThreadistLinks';
const COLUMNS = [
  'gmail_account', 'gmail_thread_id', 'gmail_message_id', 'gmail_subject',
  'gmail_sender', 'gmail_url', 'todoist_task_id', 'todoist_task_title',
  'todoist_project_name', 'linked_at'
];

/**
 * Gets or creates the storage spreadsheet.
 * The ID is stored in UserProperties.
 */
function getStorageSheet() {
  const props = PropertiesService.getUserProperties();
  let spreadsheetId = props.getProperty('STORAGE_SPREADSHEET_ID');
  let ss;

  if (spreadsheetId) {
    try {
      ss = SpreadsheetApp.openById(spreadsheetId);
    } catch (e) {
      console.warn('Could not open spreadsheet by ID, creating a new one.');
    }
  }

  if (!ss) {
    ss = SpreadsheetApp.create('Threadist Storage');
    spreadsheetId = ss.getId();
    props.setProperty('STORAGE_SPREADSHEET_ID', spreadsheetId);

    let sheet = ss.getSheetByName(STORAGE_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(STORAGE_SHEET_NAME);
      sheet.appendRow(COLUMNS);
      // Remove default Sheet1 if it's empty
      const sheet1 = ss.getSheetByName('Sheet1');
      if (sheet1 && sheet1.getLastRow() === 0) {
        ss.deleteSheet(sheet1);
      }
    }
  }

  let sheet = ss.getSheetByName(STORAGE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STORAGE_SHEET_NAME);
    sheet.appendRow(COLUMNS);
  }
  return sheet;
}

/**
 * Finds all links for a given Gmail Thread ID.
 */
function getLinksForThread(threadId) {
  const sheet = getStorageSheet();
  const data = sheet.getDataRange().getValues();
  const results = [];

  // Skip header row
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === threadId) {
      const link = {};
      COLUMNS.forEach((col, index) => {
        link[col] = data[i][index];
      });
      results.push(link);
    }
  }
  return results;
}

/**
 * Checks if a link already exists.
 */
function linkExists(threadId, taskId) {
  const sheet = getStorageSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === threadId && String(data[i][6]) === String(taskId)) {
      return true;
    }
  }
  return false;
}

/**
 * Adds a new link to the storage.
 */
function addLink(linkData) {
  if (linkExists(linkData.gmail_thread_id, linkData.todoist_task_id)) {
    return;
  }
  const sheet = getStorageSheet();
  const row = COLUMNS.map(col => linkData[col] || '');
  sheet.appendRow(row);
}

/**
 * Deletes a link from the storage.
 */
function deleteLink(threadId, taskId) {
  const sheet = getStorageSheet();
  const data = sheet.getDataRange().getValues();

  // Iterate backwards to safely delete rows
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === threadId && String(data[i][6]) === String(taskId)) {
      sheet.deleteRow(i + 1);
    }
  }
}
