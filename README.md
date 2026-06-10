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

---

## Setup (Step by Step)

You only need a free Google account and a Todoist account. The whole setup takes about 10 minutes.

### Step 1: Create the Apps Script project
1. Go to [script.google.com](https://script.google.com) and click **New project**.
2. Name the project `Threadist` (click "Untitled project" at the top).
3. Click the **gear icon (Project Settings)** in the left sidebar and check **"Show 'appsscript.json' manifest file in editor"**.

### Step 2: Add the code
1. Back in the **Editor** (< > icon), open `appsscript.json` and replace its contents with the `appsscript.json` from this repository.
2. Replace the contents of the default `Code.gs` with this repository's `Code.gs`.
3. Add the remaining files: click the **+** next to "Files", choose **Script**, and create `Todoist`, `Storage`, `Firestore`, and `Migration`. Paste in the contents of the matching `.gs` files from this repository.
4. Click the **save icon** (or Ctrl/Cmd+S).

### Step 3: Install the add-on in Gmail
1. In the Apps Script editor, click **Deploy > Test deployments**.
2. Next to "Application(s): Gmail", click **Install**.
3. Click **Done**.

### Step 4: Get your Todoist API token
1. Open Todoist and go to **Settings > Integrations > Developer**.
2. Copy your **API token**.

### Step 5: Configure Threadist
1. Open [Gmail](https://mail.google.com) and click on any email.
2. In the right-hand sidebar, click the **Threadist icon**.
3. The first time, Google asks you to **authorize** the add-on — review the permissions and click **Allow**.
4. Open the add-on's **three-dot menu (⋮) > Settings**.
5. Paste your **Todoist API Token** and click **Save Settings**.

That's it! By default Threadist stores links in a Google Sheet ("Threadist Storage") that is created automatically in your Google Drive. To verify everything works, open an email, click the Threadist icon, and click **Add-on Status** — the Todoist API should show "Healthy".

---

## Storage Backends

### 1. Google Sheets (Default)
- **Setup**: Created automatically in your Google Drive root as "Threadist Storage". No configuration needed.
- **Multi-Account**: To share across accounts, copy the **Spreadsheet ID** from the URL (the long string between `/d/` and `/edit`), share the sheet with your other accounts, and paste the ID into **Settings** in those accounts.

### 2. Google Cloud Firestore (Optional)
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
3. Change **Storage Backend** to `Google Firestore`.
4. Enter your **Firestore Project ID** in the designated field.
5. Click **Save Settings**.
6. Verify connectivity via the **Add-on Status** card.

## Migration
If you are moving from Sheets to Firestore:
1. Configure your Firestore Project ID in **Settings** (the migration will refuse to run without it).
2. Open the **Add-on Status** card.
3. Click **Migrate Sheets to Firestore**. Re-running the migration is safe — existing links are overwritten, not duplicated.

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
- **"Todoist API token not set"**: Open the add-on's three-dot menu > Settings and paste your token (Todoist > Settings > Integrations > Developer).
- **Permission Denied (Firestore 403)**:
  - Ensure the **Cloud Firestore API** is enabled.
  - Ensure you have linked your Apps Script project to the GCP Project Number.
  - Ensure you have authorized the `cloud-platform` scope during add-on authorization (remove and re-install the test deployment to re-trigger authorization).
- **Add-on doesn't appear in Gmail**: Re-check **Deploy > Test deployments > Install**, then reload the Gmail tab.
- **Deep Link Fails**: Gmail links use `/u/0/`, which may open the wrong account if you are signed into several. Use the **Copy Search** button to get a `rfc822msgid:` query you can paste into the Gmail search bar instead.

## Privacy & Security
- Relationships are stored in **your** Google Drive or GCP Project.
- Todoist tokens are stored in **your** user-specific script properties.
- No third-party servers ever see your email or task data.
