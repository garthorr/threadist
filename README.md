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
Firestore is recommended for cleaner multi-account use and highly structured data.
- **Setup**:
  1. Create a Google Cloud Project or use an existing one.
  2. Enable the **Firestore API**.
  3. Create a Firestore database in **Native Mode**.
  4. In Apps Script **Settings**, change Backend to `firestore` and enter your **Firestore Project ID**.
- **Free Quota**: Firestore includes a generous free tier (50k reads/20k writes per day), which is more than enough for personal usage.
- **Permissions**: Ensure the user account has at least `Cloud Datastore User` permissions on the GCP project.

### Migration
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

## Storage Model (Schema v2)
- `gmail_account`: Source email account.
- `gmail_thread_id`: Contextual ID for the thread.
- `todoist_task_id`: Linked Todoist task.
- `link_status`: `active` or `unlinked` (soft-delete).
- `gmail_url_strategy`: Metadata for link generation.
- `schema_version`: Tracking migrations.

## Required Google Scopes
- `gmail.addons.execute`, `gmail.addons.current.message.metadata`: Gmail context.
- `script.external_request`: Todoist API connectivity.
- `spreadsheets`: Google Sheets storage.
- `datastore`: Google Firestore storage.
- `userinfo.email`: Account identification.
- `script.locale`: UI localization.

## Troubleshooting
- **Permission Denied (Firestore)**: Verify the Firestore API is enabled in your GCP project and that you have authorized the `datastore` scope.
- **Deep Link Fails**: Use the **Copy Search** button to get a Message-ID query for Gmail.

## Privacy & Security
- Relationships are stored in **your** Google Drive or GCP Project.
- Todoist tokens are stored in **your** user-specific script properties.
- No third-party servers ever see your email or task data.
