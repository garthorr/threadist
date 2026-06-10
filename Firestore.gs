/**
 * Firestore REST API Integration
 */

/**
 * Makes a request to the Firestore REST API.
 */
function callFirestoreApi(method = 'GET', path = '', body = null) {
  const props = PropertiesService.getScriptProperties();
  const projectId = props.getProperty('FIRESTORE_PROJECT_ID');
  const databaseId = props.getProperty('FIRESTORE_DATABASE_ID') || '(default)';

  if (!projectId) {
    throw new Error('Firestore Project ID not set in Script Properties.');
  }

  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
  const url = baseUrl + path;

  const options = {
    method: method.toUpperCase(),
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };

  if (body) {
    options.payload = JSON.stringify(body);
  }

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const content = response.getContentText();

  if (code >= 200 && code < 300) {
    return content ? JSON.parse(content) : null;
  } else {
    console.error('Firestore API Error:', { url, method, code, body: content });
    throw new Error(`Firestore API Error (${code}): ${content}`);
  }
}

/**
 * Returns the list of OAuth scopes attached to the script's runtime token.
 */
function getTokenScopes() {
  const token = ScriptApp.getOAuthToken();
  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error('tokeninfo lookup failed (' + resp.getResponseCode() + ')');
  }
  const info = JSON.parse(resp.getContentText());
  return (info.scope || '').split(' ').filter(Boolean);
}

/**
 * DIAGNOSTIC: Select this function in the Apps Script editor and click Run.
 *
 * Running it from the editor forces Google to show the consent dialog for
 * EVERY scope in the manifest (which refreshes a stale authorization grant),
 * then logs exactly which scopes the token carries.
 */
function debugTokenScopes() {
  const scopes = getTokenScopes();
  console.log('Granted scopes:\n' + scopes.join('\n'));
  const hasFirestore = scopes.indexOf('https://www.googleapis.com/auth/datastore') !== -1
    || scopes.indexOf('https://www.googleapis.com/auth/cloud-platform') !== -1;
  console.log(hasFirestore ? '>>> Firestore scope PRESENT — Firestore calls should work.' : '>>> Firestore scope MISSING — the grant does not include datastore/cloud-platform.');
  return scopes;
}

/**
 * Utility to convert regular JSON to Firestore Document format.
 */
function toFirestoreDoc(obj) {
  const fields = {};
  for (const key in obj) {
    const val = obj[key];
    if (val === null || val === undefined) continue;
    if (typeof val === 'string') fields[key] = { stringValue: val };
    else if (typeof val === 'number') fields[key] = { doubleValue: val };
    else if (typeof val === 'boolean') fields[key] = { booleanValue: val };
    else if (val instanceof Date) fields[key] = { timestampValue: val.toISOString() };
    else if (Array.isArray(val)) fields[key] = { arrayValue: { values: val.map(v => toFirestoreDoc({v}).fields.v) } };
    else if (typeof val === 'object') fields[key] = { mapValue: { fields: toFirestoreDoc(val).fields } };
  }
  return { fields };
}

/**
 * Utility to convert Firestore Document format to regular JSON.
 */
function fromFirestoreDoc(doc) {
  if (!doc || !doc.fields) return null;
  const obj = {};
  const fields = doc.fields;
  for (const key in fields) {
    const f = fields[key];
    if (f.stringValue !== undefined) obj[key] = f.stringValue;
    else if (f.doubleValue !== undefined) obj[key] = Number(f.doubleValue);
    else if (f.integerValue !== undefined) obj[key] = Number(f.integerValue);
    else if (f.booleanValue !== undefined) obj[key] = f.booleanValue;
    else if (f.timestampValue !== undefined) obj[key] = new Date(f.timestampValue);
    else if (f.arrayValue !== undefined) obj[key] = (f.arrayValue.values || []).map(v => fromFirestoreDoc({fields: {v}}).v);
    else if (f.mapValue !== undefined) obj[key] = fromFirestoreDoc(f.mapValue);
  }
  return obj;
}
