/**
 * Migration Logic for Threadist
 */

/**
 * Migrates existing links from Google Sheets to Firestore.
 */
function migrateSheetsLinksToFirestore() {
  if (!PropertiesService.getScriptProperties().getProperty('FIRESTORE_PROJECT_ID')) {
    throw new Error('Firestore Project ID is not set. Configure it in Settings first.');
  }
  const sheet = SheetsStorage.getStorageSheet();
  const data = sheet.getDataRange().getValues();
  const userId = Session.getActiveUser().getEmail();
  let count = 0;

  // Skip header
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const linkData = {};
    COLUMNS.forEach((col, index) => {
      linkData[col] = row[index];
    });

    if (linkData.link_status === 'active') {
      linkData.user_id = userId;
      try {
        FirestoreStorage.addLink(linkData);
        count++;
      } catch (e) {
        console.error('Failed to migrate row ' + i, e);
      }
    }
  }
  return count;
}
