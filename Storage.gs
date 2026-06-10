/**
 * Unified Storage Manager for Threadist
 * Supports Google Sheets and Google Cloud Firestore.
 */

var StorageManager = {
  getBackend: function() {
    return PropertiesService.getScriptProperties().getProperty('STORAGE_BACKEND') || 'sheets';
  },

  getLinksForThread: function(threadId) {
    const account = Session.getActiveUser().getEmail();
    const userId = account; // Use email as persistent identifier
    if (this.getBackend() === 'firestore') {
      return FirestoreStorage.getLinksForThread(userId, account, threadId);
    }
    return SheetsStorage.getLinksForThread(threadId);
  },

  addLink: function(linkData) {
    const account = Session.getActiveUser().getEmail();
    linkData.user_id = account; // Use email as persistent identifier
    if (this.getBackend() === 'firestore') {
      return FirestoreStorage.addLink(linkData);
    }
    return SheetsStorage.addLink(linkData);
  },

  deleteLink: function(threadId, taskId) {
    const account = Session.getActiveUser().getEmail();
    const userId = account; // Use email as persistent identifier
    if (this.getBackend() === 'firestore') {
      return FirestoreStorage.unlinkTaskFromThread(userId, account, threadId, taskId);
    }
    return SheetsStorage.deleteLink(threadId, taskId);
  }
};

/**
 * Google Sheets Implementation
 */
var SheetsStorage = {
  // Logic from original Storage.gs remains here, slightly updated to support Manager interface.
  getStorageSheet: function() {
    const props = PropertiesService.getUserProperties();
    let spreadsheetId = props.getProperty('STORAGE_SPREADSHEET_ID');
    let ss;
    if (spreadsheetId) {
      try { ss = SpreadsheetApp.openById(spreadsheetId); } catch (e) {}
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
      this.migrateSchema(sheet);
    }
    return sheet;
  },

  migrateSchema: function(sheet) {
    const lastCol = sheet.getLastColumn();
    if (lastCol < COLUMNS.length) {
      const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const newHeaders = COLUMNS.filter(h => !currentHeaders.includes(h));
      if (newHeaders.length > 0) {
        sheet.getRange(1, lastCol + 1, 1, newHeaders.length).setValues([newHeaders]);
      }
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, COLUMNS.indexOf('schema_version') + 1, lastRow - 1, 1).setValue(CURRENT_SCHEMA_VERSION);
        sheet.getRange(2, COLUMNS.indexOf('link_status') + 1, lastRow - 1, 1).setValue('active');
      }
    }
  },

  getLinksForThread: function(threadId) {
    const sheet = this.getStorageSheet();
    const data = sheet.getDataRange().getValues();
    const results = [];
    const statusIdx = COLUMNS.indexOf('link_status');
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === threadId && data[i][statusIdx] === 'active') {
        const link = {};
        COLUMNS.forEach((col, index) => { link[col] = data[i][index]; });
        results.push(link);
      }
    }
    return results;
  },

  linkExists: function(account, threadId, taskId) {
    const sheet = this.getStorageSheet();
    const data = sheet.getDataRange().getValues();
    const statusIdx = COLUMNS.indexOf('link_status');
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === account && data[i][1] === threadId && String(data[i][6]) === String(taskId) && data[i][statusIdx] === 'active') {
        return true;
      }
    }
    return false;
  },

  addLink: function(linkData) {
    if (this.linkExists(linkData.gmail_account, linkData.gmail_thread_id, linkData.todoist_task_id)) return;
    const sheet = this.getStorageSheet();
    linkData.link_status = 'active';
    linkData.schema_version = CURRENT_SCHEMA_VERSION;
    linkData.gmail_url_strategy = 'thread_all_u0';
    const row = COLUMNS.map(col => linkData[col] || '');
    sheet.appendRow(row);
  },

  deleteLink: function(threadId, taskId) {
    const sheet = this.getStorageSheet();
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
};

/**
 * Firestore Implementation
 */
var FirestoreStorage = {
  getDocId: function(userId, account, threadId, taskId) {
    const raw = `${userId}_${account}_${threadId}_${taskId}`;
    const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
    return hash.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
  },

  addLink: function(linkData) {
    const docId = this.getDocId(linkData.user_id, linkData.gmail_account, linkData.gmail_thread_id, linkData.todoist_task_id);
    linkData.link_status = 'active';
    linkData.schema_version = CURRENT_SCHEMA_VERSION;
    linkData.gmail_url_strategy = 'thread_all_u0';
    linkData.linked_at = linkData.linked_at || new Date();

    const doc = toFirestoreDoc(linkData);
    // Use patch with currentDocument logic to avoid overwriting unless needed, or just set.
    return callFirestoreApi('PATCH', `/links/${docId}?currentDocument.exists=false`, doc);
  },

  getLinksForThread: function(userId, account, threadId) {
    const payload = {
      structuredQuery: {
        from: [{ collectionId: 'links' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'user_id' }, op: 'EQUAL', value: { stringValue: userId } } },
              { fieldFilter: { field: { fieldPath: 'gmail_account' }, op: 'EQUAL', value: { stringValue: account } } },
              { fieldFilter: { field: { fieldPath: 'gmail_thread_id' }, op: 'EQUAL', value: { stringValue: threadId } } },
              { fieldFilter: { field: { fieldPath: 'link_status' }, op: 'EQUAL', value: { stringValue: 'active' } } }
            ]
          }
        }
      }
    };
    const results = callFirestoreApi('POST', ':runQuery', payload);
    return (results || []).filter(r => r.document).map(r => fromFirestoreDoc(r.document));
  },

  unlinkTaskFromThread: function(userId, account, threadId, taskId) {
    const docId = this.getDocId(userId, account, threadId, taskId);
    const update = toFirestoreDoc({
      link_status: 'unlinked',
      unlinked_at: new Date()
    });
    // Partial update
    return callFirestoreApi('PATCH', `/links/${docId}?updateMask.fieldPaths=link_status&updateMask.fieldPaths=unlinked_at`, update);
  },

  upsertThreadMetadata: function(threadData) {
    const docId = threadData.gmail_thread_id;
    const doc = toFirestoreDoc(threadData);
    return callFirestoreApi('PATCH', `/threads/${docId}`, doc);
  },

  upsertTaskMetadata: function(taskData) {
    const docId = taskData.todoist_task_id;
    const doc = toFirestoreDoc(taskData);
    return callFirestoreApi('PATCH', `/tasks/${docId}`, doc);
  }
};

var STORAGE_SHEET_NAME = 'ThreadistLinks';
var CURRENT_SCHEMA_VERSION = 2;
var COLUMNS = [
  'gmail_account', 'gmail_thread_id', 'gmail_message_id', 'gmail_subject',
  'gmail_sender', 'gmail_url', 'todoist_task_id', 'todoist_task_title',
  'todoist_project_name', 'linked_at', 'link_status', 'unlinked_at',
  'gmail_url_strategy', 'schema_version'
];
