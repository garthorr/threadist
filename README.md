# Threadist: Gmail-to-Todoist Context Connector

Threadist is a focused Google Workspace add-on that links Gmail threads to Todoist tasks. It is designed around the principle that **Todoist is the source of truth for task management**, while Gmail provides the necessary context.

## Problem Statement
When managing tasks that originate from email, it's easy to lose the link between the "to-do" and the original conversation. Standard integrations often create disconnected copies or require manual copying of links. Threadist bridges this gap by attaching Gmail thread context directly to Todoist tasks, making it easy to jump back into the conversation from any device.

## Daily Workflow
1. **Discover**: Open an email thread in Gmail.
2. **Attach**:
   - Use the **Search** to find an existing Todoist task and "Attach" the thread.
   - Or use **Create** to make a new Todoist task with the thread automatically attached.
3. **Execute**: Later, in Todoist, click the Gmail link in the task's comments to jump back to the email.
4. **Context**: Reopening the same thread in Gmail shows all attached tasks and their current status (Open/Completed).
5. **Manage**: Complete tasks directly from Gmail or detach them if the relationship is no longer relevant.

## Features
- **Thread Centric**: Attaches the entire Gmail thread, ensuring all related messages are accessible.
- **Source of Truth**: Linked tasks show their real-time Todoist status (Open/Completed).
- **Multi-Account Ready**: Designed to work across multiple Gmail accounts (Consumer & Workspace) using a single shared storage Sheet.
- **Reliable Deep Links**: Stores message IDs and provides a "Copy Search" fallback if deep links fail.
- **Privacy First**: Data is stored in your own Google Drive; Todoist tokens remain in your private script storage.

## Multi-Account Setup
Threadist supports using a single storage Sheet and Todoist account across multiple Gmail accounts:
1. **Storage Sheet**: Pick one account to host the "Threadist Storage" Google Sheet.
2. **Spreadsheet ID**: Copy the ID of this spreadsheet (from the URL).
3. **Configure**: In any other Gmail account where you install Threadist, go to **Settings** and paste the **Storage Spreadsheet ID**.
4. **Token**: Use the same Todoist API Token across all accounts to maintain a unified task view.

### Deployment to Consumer Accounts
If you develop Threadist in a Workspace account, you can still use it in a personal `@gmail.com` account:
1. In the Apps Script project, click **Deploy > Test deployments**.
2. Select **Gmail Add-on** and follow the "Install" link while logged into your consumer account.
3. Ensure the consumer account has permission to access the storage Sheet and Todoist API.

## Storage Model (Schema v2)
Data is stored in a Google Sheet named `ThreadistLinks` with the following columns:
- `gmail_account`: The source email account.
- `gmail_thread_id`: Contextual ID for the thread.
- `gmail_message_id`: Metadata for reliable search fallback.
- `gmail_subject`: Thread subject line.
- `gmail_sender`: Original sender.
- `gmail_url`: Deep link to the thread.
- `todoist_task_id`: Linked Todoist task.
- `todoist_task_title`: Task content.
- `todoist_project_name`: Project context.
- `linked_at`: Timestamp.
- `link_status`: `active` or `unlinked` (soft-delete).
- `unlinked_at`: Timestamp for detach actions.
- `gmail_url_strategy`: Strategy used for link generation.
- `schema_version`: Versioning for migrations.

## Required Google Scopes
- `gmail.addons.execute`, `gmail.addons.current.message.readonly`, `gmail.addons.current.message.metadata`: Gmail context.
- `script.external_request`: Todoist API connectivity.
- `userinfo.email`: Source account identification.
- `spreadsheets`: Storage management.
- `script.locale`: User interface localization.

## Troubleshooting
- **Deep Link Fails**: Use the "Copy Search" button in the linked task card. Paste the result into the Gmail search bar to find the exact message.
- **Search Returns Nothing**: Ensure your Todoist Token is healthy via the "Add-on Status" card.
- **Permission Denied**: Ensure you have authorized the `spreadsheets` scope and that you have access to the Storage Spreadsheet ID provided in Settings.

## Privacy & Security
- Threadist does **not** store your email content.
- All relationships are stored in **your** Google Drive.
- Todoist API tokens are stored in **your** user-specific Google Apps Script properties.
- No third-party servers (other than Todoist) ever see your data.

## Roadmap
- [ ] Task filtering/sorting by project in the "Attach" view.
- [ ] Support for adding multiple comments per link.
- [ ] Optional sync of Todoist labels back to Gmail.
