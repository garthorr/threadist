# Threadist: Gmail to Todoist Connector

Threadist is a Google Workspace Gmail add-on that allows you to link Gmail threads to existing Todoist tasks.

## Features

- View Gmail thread metadata (Subject, Sender, Thread ID) in the sidebar.
- Search for existing Todoist tasks.
- Link one or more Todoist tasks to a Gmail thread.
- Automatically add a comment to the Todoist task with a link back to the Gmail thread.
- Persistent relationship: Reopening a thread shows already linked tasks.
- Todoist remains the source of truth for tasks.

## Setup Instructions

### 1. Todoist API Setup
1. Log in to [Todoist](https://todoist.com).
2. Go to **Settings > Integrations > Developer**.
3. Copy your **API token**.

### 2. Google Apps Script Setup
1. Go to [script.google.com](https://script.google.com).
2. Create a new project named "Threadist".
3. Replace the contents of the files with the provided code:
   - `appsscript.json` (Project Settings > Show "appsscript.json" manifest file in editor)
   - `Code.gs`
   - `Todoist.gs`
   - `Storage.gs`
4. Save the project.

### 3. Google Cloud Project & Deployment
1. Open **Project Settings** in Apps Script.
2. Under "Google Cloud Platform (GCP) Project", click "Change project".
3. Follow the instructions to link it to a Google Cloud project (you may need to create one at the [GCP Console](https://console.cloud.google.com/)).
4. Configure the OAuth Consent Screen in GCP:
   - Scopes required: `https://www.googleapis.com/auth/gmail.addons.execute`, `https://www.googleapis.com/auth/gmail.addons.current.message.readonly`, `https://www.googleapis.com/auth/gmail.addons.current.message.metadata`, `https://www.googleapis.com/auth/script.external_request`, `https://www.googleapis.com/auth/script.storage`.
5. In Apps Script, click **Deploy > Test deployments**.
6. Select **Gmail Add-on** and follow the steps to install it in your account.

### 4. Configuration
1. Open Gmail.
2. Open any email thread.
3. Click the Threadist icon in the sidebar.
4. If prompted, authorize the add-on.
5. Click the three-dot menu in the sidebar and select **Settings**.
6. Paste your Todoist API token and click **Save**.

## Data Model
- **Source of Truth**: Todoist (Tasks).
- **Mappings**: Stored in Google Apps Script `UserProperties` using the key format `thread_{gmailThreadId}` and value as a JSON-stringified array of `taskId`s.

## Scopes
- `gmail.addons.execute`: Allows the add-on to run.
- `gmail.addons.current.message.readonly`: Allows the add-on to read the content of the current message.
- `gmail.addons.current.message.metadata`: Allows the add-on to read message metadata (headers).
- `script.external_request`: Allows the add-on to connect to the Todoist API.
- `script.storage`: Allows the add-on to store linked task IDs.

## Limitations & Notes
- **Multiple Accounts**: The add-on uses `Session.getActiveUser().getEmail()` to show the current account, but Todoist linking is tied to the provided API token.
- **Gmail Deep Links**: The "URL" added to Todoist comments follows the pattern `https://mail.google.com/mail/u/0/#all/{threadId}`. This may not work perfectly if the user is logged into multiple Google accounts (different `/u/X/` prefix) or if the message is moved.
- **API Rate Limits**: Todoist and Google Apps Script have rate limits. Large volumes of requests may be throttled.
- **Task Deletion**: If a task is deleted in Todoist, the add-on will show an error or "task not found" when trying to fetch it.
