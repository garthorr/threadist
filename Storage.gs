/**
 * Storage Logic using Google Sheets
 *
 * Schema Version: 2
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
 * 10: link_status (active, unlinked)
 * 11: unlinked_at
 * 12: gmail_url_strategy
 * 13: schema_version
 */

var STORAGE_SHEET_NAME = 'ThreadistLinks';
var CURRENT_SCHEMA_VERSION = 2;
var COLUMNS = [
  'gmail_account', 'gmail_thread_id', 'gmail_message_id', 'gmail_subject',
  'gmail_sender', 'gmail_url', 'todoist_task_id', 'todoist_task_title',
  'todoist_project_name', 'linked_at', 'link_status', 'unlinked_at',
  'gmail_url_strategy', 'schema_version'
];

/**
 * Gets or creates the storage spreadsheet.
 */
function getStorageSheet() {
  const props = PropertiesService.getUserProperties();
  let spreadsheetId = props.getProperty('STORAGE_SPREADSHEET_ID');
  let ss;

  if (spreadsheetId) {
    try {
      ss = SpreadsheetApp.openById(spreadsheetId);
    } catch (e) {
      console.warn('Could not open spreadsheet by ID.');
    }
  }

  if (!ss) {
    ss = SpreadsheetApp.create('Threadist Storage');
    spreadsheetId = ss.getId();
    props.setProperty('STORAGE_SPREADSHEET_ID', spreadsheetId);
  }

  let sheet = ss.getSheetByName(STORAGE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STORAGE_SHEET_NAME);
    sheet.appendRow(COLUMNS);
  } else {
    migrateSchema(sheet);
  }
  return sheet;
}

/**
 * Migration helper.
 */
function migrateSchema(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < COLUMNS.length) {
    // Basic migration: append missing headers
    const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const newHeaders = COLUMNS.filter(h => !currentHeaders.includes(h));
    if (newHeaders.length > 0) {
      sheet.getRange(1, lastCol + 1, 1, newHeaders.length).setValues([newHeaders]);
    }
    // Set schema version for existing rows
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, COLUMNS.indexOf('schema_version') + 1, lastRow - 1, 1).setValue(CURRENT_SCHEMA_VERSION);
      sheet.getRange(2, COLUMNS.indexOf('link_status') + 1, lastRow - 1, 1).setValue('active');
    }
  }
}

/**
 * Finds all active links for a given Gmail Thread ID.
 */
function getLinksForThread(threadId) {
  const sheet = getStorageSheet();
  const data = sheet.getDataRange().getValues();
  const results = [];
  const statusIdx = COLUMNS.indexOf('link_status');

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === threadId && data[i][statusIdx] === 'active') {
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
 * Checks if an active link already exists.
 * Duplicate protection: gmail_account + gmail_thread_id + todoist_task_id
 */
function linkExists(account, threadId, taskId) {
  const sheet = getStorageSheet();
  const data = sheet.getDataRange().getValues();
  const statusIdx = COLUMNS.indexOf('link_status');

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === account &&
        data[i][1] === threadId &&
        String(data[i][6]) === String(taskId) &&
        data[i][statusIdx] === 'active') {
      return true;
    }
  }
  return false;
}

/**
 * Adds a new link with full metadata.
 */
function addLink(linkData) {
  if (linkExists(linkData.gmail_account, linkData.gmail_thread_id, linkData.todoist_task_id)) {
    return;
  }
  const sheet = getStorageSheet();
  linkData.link_status = 'active';
  linkData.schema_version = CURRENT_SCHEMA_VERSION;
  linkData.gmail_url_strategy = 'thread_all_u0'; // Strategy used for the URL

  const row = COLUMNS.map(col => linkData[col] || '');
  sheet.appendRow(row);
}

/**
 * Soft-deletes a link.
 */
function deleteLink(threadId, taskId) {
  const sheet = getStorageSheet();
  const data = sheet.getDataRange().getValues();
  const statusIdx = COLUMNS.indexOf('link_status');
  const unlinkIdx = COLUMNS.indexOf('unlinked_at');

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === threadId && String(data[i][6]) === String(taskId) && data[i][statusIdx] === 'active') {
      sheet.getRange(i + 1, statusIdx + 1).setValue('unlinked');
      sheet.getRange(i + 1, unlinkIdx + 1).setValue(new Date());
    }
  }
}
