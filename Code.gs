/**
 * Main UI Logic for Threadist Gmail Add-on
 */

/**
 * Entry point for Gmail contextual trigger.
 */
function onGmailMessage(e) {
  try {
    const messageId = e.gmail.messageId;
    const accessToken = e.gmail.accessToken;
    GmailApp.setCurrentMessageAccessToken(accessToken);

    const message = GmailApp.getMessageById(messageId);
    const threadId = message.getThread().getId();

    return createMainCard(threadId, messageId);
  } catch (err) {
    return showErrorCard('Initialization failed: ' + err.message);
  }
}

/**
 * Creates the main contextual card.
 */
function createMainCard(threadId, messageId, searchResults = null, query = '', statusMsg = null) {
  const message = GmailApp.getMessageById(messageId);
  const subject = message.getSubject();
  const userEmail = Session.getActiveUser().getEmail();

  const card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle('Threadist').setSubtitle('Attach Thread to Todoist'));

  if (statusMsg) {
    card.addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText('<b>' + statusMsg + '</b>')));
  }

  // Linked Tasks Section
  const links = getLinksForThread(threadId);
  const linkedSection = CardService.newCardSection().setHeader('Linked Todoist Tasks');

  if (links.length === 0) {
    linkedSection.addWidget(CardService.newTextParagraph().setText('No tasks attached to this thread.'));
  } else {
    links.forEach(link => {
      let taskStatus = 'Loading...';
      try {
        const task = getTask(link.todoist_task_id);
        taskStatus = task.is_completed ? '✅ Completed' : '⭕ Open';
      } catch (e) {
        taskStatus = 'Error fetching status';
      }

      const taskText = `<b>${link.todoist_task_title}</b>\n<i>${link.todoist_project_name} • ${taskStatus}</i>\n<font color="#777777">Source: ${link.gmail_account}</font>`;

      const decorated = CardService.newDecoratedText()
        .setText(taskText)
        .setWrapText(true)
        .setButton(
          CardService.newTextButton()
            .setText('Open')
            .setOpenLink(CardService.newOpenLink().setUrl('https://todoist.com/showTask?id=' + link.todoist_task_id))
        );

      linkedSection.addWidget(decorated);

      const actions = CardService.newButtonSet()
        .addButton(
          CardService.newTextButton()
            .setText('Complete')
            .setOnClickAction(CardService.newAction().setFunctionName('handleCompleteTask').setParameters({threadId: threadId, taskId: String(link.todoist_task_id), messageId: messageId}))
        )
        .addButton(
          CardService.newTextButton()
            .setText('Copy Search')
            .setOnClickAction(CardService.newAction().setFunctionName('handleCopySearch').setParameters({query: `rfc822msgid:${link.gmail_message_id}`}))
        )
        .addButton(
          CardService.newTextButton()
            .setText('Detach')
            .setOnClickAction(CardService.newAction().setFunctionName('confirmUnlink').setParameters({threadId: threadId, taskId: String(link.todoist_task_id), messageId: messageId}))
        );

      linkedSection.addWidget(actions);
    });
  }
  card.addSection(linkedSection);

  // Quick Actions Section
  const quickActions = CardService.newCardSection().setHeader('Quick Actions');
  quickActions.addWidget(
    CardService.newTextButton()
      .setText('Create New Task From Thread')
      .setOnClickAction(CardService.newAction().setFunctionName('showCreateTaskCard').setParameters({threadId: threadId, messageId: messageId}))
  );
  quickActions.addWidget(
    CardService.newTextButton()
      .setText('Add-on Status')
      .setOnClickAction(CardService.newAction().setFunctionName('showStatusCard'))
  );
  card.addSection(quickActions);

  // Search and Link Section
  const searchSection = CardService.newCardSection().setHeader('Attach Existing Task');
  const searchInput = CardService.newTextInput()
    .setFieldName('search_query')
    .setTitle('Search Todoist')
    .setHint('Search by name')
    .setSuggestions(CardService.newSuggestions().addSuggestions(['Today', 'Inbox']));

  if (query) searchInput.setValue(query);

  searchSection.addWidget(searchInput);
  searchSection.addWidget(
    CardService.newButtonSet()
      .addButton(CardService.newTextButton().setText('Search').setOnClickAction(CardService.newAction().setFunctionName('handleSearch').setParameters({threadId, messageId})))
      .addButton(CardService.newTextButton().setText('Recent').setOnClickAction(CardService.newAction().setFunctionName('handleLoadRecent').setParameters({threadId, messageId})))
  );

  if (searchResults) {
    if (searchResults.length === 0) {
      searchSection.addWidget(CardService.newTextParagraph().setText('No tasks found.'));
    } else {
      searchSection.addWidget(
        CardService.newSelectionInput()
          .setType(CardService.SelectionInputType.CHECK_BOX)
          .setFieldName('add_comment')
          .addItem('Add Todoist comment with Gmail link', 'yes', true)
      );

      const selectionInput = CardService.newSelectionInput()
        .setType(CardService.SelectionInputType.CHECK_BOX)
        .setFieldName('selected_tasks')
        .setTitle('Select tasks to attach');

      let itemCount = 0;
      searchResults.slice(0, 15).forEach(task => {
        if (!linkExists(userEmail, threadId, task.id)) {
          const due = task.due ? ` (Due: ${task.due.date || task.due})` : '';
          const priority = task.priority ? ` [P${5 - task.priority}]` : '';
          selectionInput.addItem(`${task.task_content || task.content} [${task.project_name}]${due}${priority}`, String(task.id), false);
          itemCount++;
        }
      });

      if (itemCount > 0) {
        searchSection.addWidget(selectionInput);
        searchSection.addWidget(
          CardService.newTextButton()
            .setText('Attach Selected Tasks')
            .setOnClickAction(CardService.newAction().setFunctionName('handleMultiLink').setParameters({threadId, messageId}))
        );
      } else {
        searchSection.addWidget(CardService.newTextParagraph().setText('No new tasks matching or already attached.'));
      }
    }
  }
  card.addSection(searchSection);

  return card.build();
}

/**
 * Handles copy search command.
 */
function handleCopySearch(e) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('Search query copied to clipboard: ' + e.parameters.query))
    .build();
}

/**
 * Shows the Status card.
 */
function showStatusCard(e) {
  const card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Threadist Status'));
  const section = CardService.newCardSection();

  const tokenStatus = testConnectivity();
  const storageId = PropertiesService.getUserProperties().getProperty('STORAGE_SPREADSHEET_ID') || 'Not Set';
  const userEmail = Session.getActiveUser().getEmail();

  section.addWidget(CardService.newDecoratedText().setTopLabel('Gmail Account').setText(userEmail));
  section.addWidget(CardService.newDecoratedText().setTopLabel('Todoist API').setText(tokenStatus.message).setBottomLabel(tokenStatus.success ? 'Healthy' : 'Error'));
  section.addWidget(CardService.newDecoratedText().setTopLabel('Storage Sheet ID').setText(storageId));

  card.addSection(section);
  return card.build();
}

/**
 * Handles task completion. (Source of truth remains Todoist, we just refresh).
 */
function handleCompleteTask(e) {
  const threadId = e.parameters.threadId;
  const taskId = e.parameters.taskId;
  const messageId = e.parameters.messageId;

  const accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  try {
    closeTask(taskId);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(createMainCard(threadId, messageId, null, '', 'Task marked as completed in Todoist.')))
      .setNotification(CardService.newNotification().setText('Task completed'))
      .build();
  } catch (err) {
    return showErrorCard('Failed to complete task: ' + err.message);
  }
}

/**
 * Entry points for cards and handlers below (reused from previous implementation with minor fixes for naming)
 */

function handleSearch(e) {
  const {threadId, messageId} = e.parameters;
  const query = e.formInput.search_query;
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  try {
    const message = GmailApp.getMessageById(messageId);
    const results = searchTasksEnhanced(query, message.getSubject(), message.getFrom(), threadId);
    return CardService.newNavigation().updateCard(createMainCard(threadId, messageId, results, query));
  } catch (err) { return showErrorCard('Search failed: ' + err.message); }
}

function handleLoadRecent(e) {
  const {threadId, messageId} = e.parameters;
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  try {
    const results = searchTasksEnhanced('', '', '', threadId);
    return CardService.newNavigation().updateCard(createMainCard(threadId, messageId, results, ''));
  } catch (err) { return showErrorCard('Load recent failed: ' + err.message); }
}

function showCreateTaskCard(e) {
  const {threadId, messageId} = e.parameters;
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  const message = GmailApp.getMessageById(messageId);
  const card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Create & Attach Task'));
  const section = CardService.newCardSection()
    .addWidget(CardService.newTextInput().setFieldName('task_content').setTitle('Task Title').setValue(message.getSubject()));

  const projectPicker = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setFieldName('project_id').setTitle('Project');
  try {
    getProjects().forEach(p => projectPicker.addItem(p.name || p.title, p.id, (p.name || p.title) === 'Inbox'));
  } catch (err) { section.addWidget(CardService.newTextParagraph().setText('Error loading projects.')); }
  section.addWidget(projectPicker);

  const labelPicker = CardService.newSelectionInput().setType(CardService.SelectionInputType.CHECK_BOX).setFieldName('label_ids').setTitle('Labels');
  try {
    getLabels().forEach(l => labelPicker.addItem(l.name, l.name, false));
  } catch (err) { console.error('Error loading labels', err); }
  section.addWidget(labelPicker);

  section.addWidget(CardService.newTextButton().setText('Create & Attach').setOnClickAction(CardService.newAction().setFunctionName('handleCreateAndLink').setParameters({threadId, messageId})));
  card.addSection(section);
  return card.build();
}

function handleCreateAndLink(e) {
  const {threadId, messageId} = e.parameters;
  const {task_content, project_id} = e.formInput;
  const label_ids = e.formInputs.label_ids || [];
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  try {
    const task = createTask(task_content, project_id, label_ids);
    const projects = getProjects();
    const projectName = projects.find(p => p.id === project_id)?.name || 'Unknown';
    performLink(threadId, messageId, task.id, task.content, projectName, true);
    return CardService.newNavigation().popToRoot().updateCard(createMainCard(threadId, messageId, null, '', 'Successfully created and attached task!'));
  } catch (err) { return showErrorCard('Failed to create task: ' + err.message); }
}

function handleMultiLink(e) {
  const {threadId, messageId} = e.parameters;
  const selectedTaskIds = e.formInputs.selected_tasks;
  const addCommentFlag = e.formInput.add_comment;
  if (!selectedTaskIds || selectedTaskIds.length === 0) return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText('No tasks selected')).build();
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  try {
    const projects = getProjects();
    const projectMap = {}; projects.forEach(p => projectMap[p.id] = p.name || p.title);
    selectedTaskIds.forEach(taskId => {
      const task = getTask(taskId);
      const projectName = projectMap[task.project_id] || 'Inbox';
      performLink(threadId, messageId, taskId, task.content || task.text, projectName, addCommentFlag === 'yes');
    });
    return CardService.newNavigation().updateCard(createMainCard(threadId, messageId, null, '', `Successfully attached ${selectedTaskIds.length} tasks!`));
  } catch (err) { return showErrorCard('Attaching failed: ' + err.message); }
}

function performLink(threadId, messageId, taskId, taskTitle, projectName, shouldAddComment) {
  const message = GmailApp.getMessageById(messageId);
  const subject = message.getSubject();
  const sender = message.getFrom();
  const userEmail = Session.getActiveUser().getEmail();
  const threadUrl = 'https://mail.google.com/mail/u/0/#all/' + threadId;

  const linkData = {
    gmail_account: userEmail,
    gmail_thread_id: threadId,
    gmail_message_id: messageId,
    gmail_subject: subject,
    gmail_sender: sender,
    gmail_url: threadUrl,
    todoist_task_id: taskId,
    todoist_task_title: taskTitle,
    todoist_project_name: projectName,
    linked_at: new Date()
  };

  addLink(linkData);

  if (shouldAddComment) {
    try {
      const comment = 'Linked Gmail Thread: ' + subject + '\nURL: ' + threadUrl;
      addComment(taskId, comment);
    } catch (err) { console.error('Failed to add comment', err); }
  }
}

function confirmUnlink(e) {
  const {threadId, taskId, messageId} = e.parameters;
  const card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Confirm Detach'));
  const section = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText('Are you sure you want to detach this task? This will not delete the task from Todoist.'))
    .addWidget(CardService.newTextButton().setText('Yes, Detach').setOnClickAction(CardService.newAction().setFunctionName('handleUnlinkConfirmed').setParameters({threadId, taskId, messageId})))
    .addWidget(CardService.newTextButton().setText('Cancel').setOnClickAction(CardService.newAction().setFunctionName('goBackToMain')));
  card.addSection(section);
  return card.build();
}

function handleUnlinkConfirmed(e) {
  const {threadId, taskId, messageId} = e.parameters;
  deleteLink(threadId, taskId);
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  return CardService.newNavigation().popCard().updateCard(createMainCard(threadId, messageId, null, '', 'Successfully detached task.'));
}

function goBackToMain(e) { return CardService.newNavigation().popCard(); }

function onSettings(e) {
  const card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Settings'));
  const section = CardService.newCardSection();
  const token = getTodoistToken() || '';
  const storageId = PropertiesService.getUserProperties().getProperty('STORAGE_SPREADSHEET_ID') || '';

  section.addWidget(CardService.newTextInput().setFieldName('todoist_token').setTitle('Todoist API Token').setValue(token));
  section.addWidget(CardService.newTextInput().setFieldName('storage_id').setTitle('Storage Spreadsheet ID').setHint('Leave blank to use default').setValue(storageId));
  section.addWidget(CardService.newTextButton().setText('Save Settings').setOnClickAction(CardService.newAction().setFunctionName('saveSettings')));
  card.addSection(section);
  return card.build();
}

function saveSettings(e) {
  const token = e.formInput.todoist_token;
  const storageId = e.formInput.storage_id;
  const props = PropertiesService.getUserProperties();
  if (token) props.setProperty('TODOIST_API_TOKEN', token);
  if (storageId) props.setProperty('STORAGE_SPREADSHEET_ID', storageId);
  else props.deleteProperty('STORAGE_SPREADSHEET_ID');

  return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText('Settings saved')).build();
}

function showErrorCard(message) {
  const card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Error'));
  card.addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText(message)));
  return card.build();
}
