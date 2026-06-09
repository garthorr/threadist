# Threadist: Gmail to Todoist Connector

Threadist is a Google Workspace Gmail add-on that allows you to link Gmail threads to existing Todoist tasks or create new ones directly from your inbox.

## Features

- **Linked Task Display**: Reopening a Gmail thread shows all linked Todoist tasks at the top with project names and direct links to Todoist.
- **Improved Task Search**: Search for existing Todoist tasks. Results are sorted by relevance (due today/upcoming first, then priority).
- **Multi-select Linking**: Select multiple tasks from search results and link them all at once.
- **Quick Task Creation**: Create a new Todoist task from an email subject and link it instantly, with project selection.
- **Enhanced Metadata Storage**: Stores detailed link information in a Google Sheet for easy reference and management.
- **Unlink with Confirmation**: Safely remove links between emails and tasks without deleting the actual task or email.
- **Automatic Comments**: Optionally add a comment to Todoist tasks with a link back to the original Gmail thread.

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
3. Follow the instructions to link it to a Google Cloud project.
4. Configure the OAuth Consent Screen in GCP with the required scopes.
5. In Apps Script, click **Deploy > Test deployments**.
6. Select **Gmail Add-on** and follow the steps to install it in your account.

### 4. Configuration
1. Open Gmail.
2. Open any email thread.
3. Click the Threadist icon in the sidebar.
4. If prompted, authorize the add-on. **Note**: You will need to authorize `https://www.googleapis.com/auth/spreadsheets` as the add-on will create a "Threadist Storage" spreadsheet in your Google Drive.
5. Click the three-dot menu in the sidebar and select **Settings**.
6. Paste your Todoist API token and click **Save**.

## How Storage Works
Threadist uses a Google Sheet named **Threadist Storage** (created automatically in your Google Drive root) to track links between Gmail threads and Todoist tasks.

Columns include:
- `gmail_account`: The email address of the user.
- `gmail_thread_id` / `gmail_message_id`: Internal Gmail identifiers.
- `gmail_subject` / `gmail_sender`: Metadata for display.
- `gmail_url`: A deep link back to the email.
- `todoist_task_id`: The ID of the linked Todoist task.
- `todoist_task_title` / `todoist_project_name`: Metadata for display.
- `linked_at`: Timestamp of when the link was created.

## Required Google Scopes
- `https://www.googleapis.com/auth/gmail.addons.execute`: Run the add-on.
- `https://www.googleapis.com/auth/gmail.addons.current.message.readonly`: Read current message content.
- `https://www.googleapis.com/auth/gmail.addons.current.message.metadata`: Read message headers (Subject, From).
- `https://www.googleapis.com/auth/script.external_request`: Connect to Todoist API.
- `https://www.googleapis.com/auth/userinfo.email`: Display your account email in the UI.
- `https://www.googleapis.com/auth/spreadsheets`: Manage the storage Google Sheet.
- `https://www.googleapis.com/auth/script.locale`: Allows the add-on to use your locale settings.

## Known Limitations
- **Gmail Deep Links**: Links are generated as `https://mail.google.com/mail/u/0/#all/{threadId}`. If you use multiple Google accounts simultaneously, the `/u/0/` part might point to the wrong account.
- **Search Limits**: Search results are limited to the top 10 matches for performance.
- **Project Listing**: If you have hundreds of projects, the dropdown might become cumbersome.

## Testing Checklist
1. [ ] Add-on loads in Gmail sidebar when a thread is open.
2. [ ] Settings saves Todoist API token.
3. [ ] Task search returns correct tasks from Todoist.
4. [ ] Linking a task creates a row in the "Threadist Storage" Google Sheet.
5. [ ] Linked tasks appear at the top of the card when reopening the thread.
6. [ ] "Open in Todoist" button correctly navigates to the task.
7. [ ] Creating a new task works and links it automatically.
8. [ ] Unlinking removes the association from the Google Sheet and updates the UI.
9. [ ] Errors (e.g., invalid API token) are displayed as user-friendly messages.

## Troubleshooting Todoist API Errors

If you encounter errors when searching or linking tasks, check the following:

- **Invalid API Token (401)**: Ensure you have copied the correct "API token" from Todoist **Settings > Integrations > Developer**. If you reset your token in Todoist, you must update it in the add-on settings.
- **Access Forbidden (403)**: Ensure your account has permissions for the tasks/projects you are trying to access.
- **Search Not Working**: If search returns no results, try a broader query. The add-on searches task content (text).
- **Projects Not Loading**: If the project picker in "Create Task" is empty, ensure you have active projects in Todoist.
- **Connection Issues**: Google Apps Script sometimes experiences temporary connection issues. If an error persists, try again after a few minutes.
- **Console Logs**: Developers can check execution logs in the Google Apps Script editor for more detailed error information.
