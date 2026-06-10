# Threadist: Gmail-to-Todoist Context Connector

Threadist is a focused Google Workspace add-on that links Gmail threads to Todoist tasks. It is designed around the principle that **Todoist is the source of truth for task management**, while Gmail provides the necessary context.

## Daily Workflow
1. **Discover**: Open an email thread in Gmail.
2. **Attach**: Use **Search** to find a Todoist task or **Create** a new one to "Attach" the thread.
3. **Execute**: Later, in Todoist, click the Gmail link in the task's comments to jump back to the email.
4. **Context**: Reopening the same thread in Gmail shows all attached tasks and their current status (Open/Completed).

## Features
- **Thread Centric**: Attaches entire Gmail threads by default.
- **Source of Truth**: Linked tasks show real-time Todoist status (Open/Completed).
- **Multi-Account Ready**: Works across multiple accounts using a single shared storage (Sheets or Firestore).
- **Flexible Storage**: Supports Google Sheets or Google Cloud Firestore backends.
- **Privacy First**: Data stays in your control (Google Drive or GCP Project).

## Storage Backends

### 1. Google Sheets (Default)
- **Setup**: Created automatically in your Google Drive root as "Threadist Storage".
- **Multi-Account**: To share across accounts, copy the **Spreadsheet ID** from the URL and paste it into **Settings** in your other accounts.

### 2. Google Cloud Firestore
Firestore is recommended for multi-account use. Follow these granular steps to set it up:

#### A. Create/Configure GCP Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project named `Threadist-Storage`.
3. In the sidebar, go to **APIs & Services > Library**.
4. Search for and **Enable** the **Cloud Firestore API**.

#### B. Create Firestore Database
1. In the GCP sidebar, go to **Firestore**.
2. Click **Create Database**.
3. Select **Native Mode** (required).
4. Choose a location and click **Create Database**.
5. (Optional) Go to the **Rules** tab and ensure they allow read/write access to authenticated users. For personal use, you can use:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

#### C. Link Apps Script to GCP
1. In your Apps Script editor, go to **Project Settings**.
2. Under **Google Cloud Platform (GCP) Project**, click **Change project**.
3. Enter your **GCP Project Number** (found on the GCP Dashboard).
4. Click **Set project**.

#### D. Configure Add-on
1. Open Gmail and click the Threadist icon.
2. Go to the three-dot menu > **Settings**.
3. Change **Storage Backend** to `firestore`.
4. Enter your **Firestore Project ID** in the designated field.
5. Click **Save Settings**.
6. Verify connectivity via the **Add-on Status** card.

## Migration
If you are moving from Sheets to Firestore:
1. Configure your Firestore Project ID in **Settings**.
2. Open the **Add-on Status** card.
3. Click **Migrate Sheets to Firestore**.

## Multi-Account Setup
1. **Host Project**: Pick one account to host the storage (Sheet or Firestore).
2. **Settings**: In all other accounts, use the same **Storage Spreadsheet ID** or **Firestore Project ID**.
3. **Token**: Use the same Todoist API Token for a unified view.

### Deployment to Consumer Accounts
If developed in a Workspace account, use **Deploy > Test deployments** to get an installation link for personal `@gmail.com` accounts.

## Required Google Scopes
Threadist uses "Minimum Viable Permissions" to protect your privacy:
- `gmail.addons.execute`: Essential add-on functionality.
- `gmail.addons.current.message.metadata`: Reads Subject/From/Message-ID (**No email body access**).
- `script.external_request`: Connects to Todoist API.
- `spreadsheets`: Google Sheets storage.
- `datastore` / `cloud-platform`: Google Firestore storage and GCP management.
- `userinfo.email`: Account identification for multi-account support.
- `script.locale`: UI formatting.

## Troubleshooting
- **Permission Denied (Firestore 403)**:
  - Ensure the **Cloud Firestore API** is enabled.
  - Ensure you have linked your Apps Script project to the GCP Project Number.
  - Ensure you have authorized the `cloud-platform` scope during add-on authorization.
- **Deep Link Fails**: Use the **Copy Search** button to get a Message-ID query for Gmail.

## Privacy & Security
- Relationships are stored in **your** Google Drive or GCP Project.
- Todoist tokens are stored in **your** user-specific script properties.
- No third-party servers ever see your email or task data.
