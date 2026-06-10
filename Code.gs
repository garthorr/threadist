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
  const card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle('Threadist').setSubtitle('Attach Thread to Todoist'));

  if (statusMsg) {
    card.addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText('<b>' + statusMsg + '</b>')));
  }

  // Linked Tasks Section
  const links = StorageManager.getLinksForThread(threadId);
  const linkedSection = CardService.newCardSection().setHeader('Linked Todoist Tasks');

  if (links.length === 0) {
    linkedSection.addWidget(CardService.newTextParagraph().setText('No tasks attached to this thread.'));
  } else {
    // Optimization: Fetch all active tasks once to avoid N+1 network calls for status
    let activeTaskIds = [];
    try {
      activeTaskIds = getActiveTasks().map(t => String(t.task_id || t.id || t.uuid || ''));
    } catch (e) {
      console.warn('Failed to fetch active tasks for status check', e);
    }

    links.forEach(link => {
      const tId = String(link.todoist_task_id);
      const is_active = activeTaskIds.includes(tId);
      const taskStatus = is_active ? '⭕ Open' : '✅ Completed';

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
      const activeLinkedTaskIds = links.map(l => String(l.todoist_task_id));

      searchResults.slice(0, 15).forEach(task => {
        const taskId = String(task.task_id || task.id || task.uuid || '');
        if (taskId && activeLinkedTaskIds.indexOf(taskId) === -1) {
          const content = task.task_content || task.content || task.text || task.title || 'Untitled Task';
          const dueData = task.due ? (task.due.date || (typeof task.due === 'string' ? task.due : null)) : null;
          const due = dueData ? ` (Due: ${dueData})` : '';
          const priority = task.priority ? ` [P${5 - task.priority}]` : '';
          selectionInput.addItem(`${content} [${task.project_name}]${due}${priority}`, taskId, false);
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
 * Handles copy search command by showing a card with a selectable query.
 */
function handleCopySearch(e) {
  const query = e.parameters.query;
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Copy Search Query'))
    .addSection(
      CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText('Copy and paste this into the Gmail search bar to find the exact thread:'))
        .addWidget(CardService.newTextInput().setFieldName('query').setTitle('Search Query').setValue(query))
        .addWidget(CardService.newTextButton().setText('Back').setOnClickAction(CardService.newAction().setFunctionName('goBackToMain')))
    );
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card.build()))
    .build();
}

/**
 * Shows the Status card.
 */
function showStatusCard(e) {
  const card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Threadist Status'));
  const section = CardService.newCardSection();

  const tokenStatus = testConnectivity();
  const backend = StorageManager.getBackend();
  const userEmail = Session.getActiveUser().getEmail();

  section.addWidget(CardService.newDecoratedText().setTopLabel('Gmail Account').setText(userEmail));
  section.addWidget(CardService.newDecoratedText().setTopLabel('Todoist API').setText(tokenStatus.message).setBottomLabel(tokenStatus.success ? 'Healthy' : 'Error'));
  section.addWidget(CardService.newDecoratedText().setTopLabel('Storage Backend').setText(backend.toUpperCase()));

  if (backend === 'firestore') {
    const projId = PropertiesService.getScriptProperties().getProperty('FIRESTORE_PROJECT_ID') || 'Not Set';
    section.addWidget(CardService.newDecoratedText().setTopLabel('Firestore Project').setText(projId));
    try {
      FirestoreStorage.getLinksForThread('test', 'test', 'test');
      section.addWidget(CardService.newDecoratedText().setTopLabel('Firestore Test').setText('Success').setBottomLabel('Read/Write test passed'));
    } catch (err) {
      section.addWidget(CardService.newDecoratedText().setTopLabel('Firestore Test').setText('Failed').setBottomLabel(err.message));
    }
  } else {
    const storageId = PropertiesService.getUserProperties().getProperty('STORAGE_SPREADSHEET_ID') || 'Not Set';
    section.addWidget(CardService.newDecoratedText().setTopLabel('Storage Sheet ID').setText(storageId));
  }

  if (tokenStatus.success) {
    section.addWidget(CardService.newDecoratedText().setTopLabel('Todoist Stats').setText(`${tokenStatus.projectCount} Projects, ${tokenStatus.taskCount} Tasks, ${tokenStatus.labelCount} Labels`));
  }

  card.addSection(section);

  const actionSection = CardService.newCardSection().setHeader('Migration');
  actionSection.addWidget(CardService.newTextButton().setText('Migrate Sheets to Firestore').setOnClickAction(CardService.newAction().setFunctionName('handleMigration')));
  card.addSection(actionSection);

  return card.build();
}

function handleMigration(e) {
  try {
    const count = migrateSheetsLinksToFirestore();
    return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(`Migrated ${count} links to Firestore.`)).build();
  } catch (err) {
    return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(`Migration failed: ${err.message}`)).build();
  }
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
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(createMainCard(threadId, messageId, results, query)))
      .build();
  } catch (err) { return showErrorCard('Search failed: ' + err.message); }
}

function handleLoadRecent(e) {
  const {threadId, messageId} = e.parameters;
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  try {
    const results = searchTasksEnhanced('', '', '', threadId);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(createMainCard(threadId, messageId, results, '')))
      .build();
  } catch (err) { return showErrorCard('Load recent failed: ' + err.message); }
}

function showCreateTaskCard(e) {
  const {threadId, messageId} = e.parameters;
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  const message = GmailApp.getMessageById(messageId);
  const card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Create & Attach Task'));

  // Basic Info Section
  const basicSection = CardService.newCardSection()
    .addWidget(CardService.newTextInput().setFieldName('task_content').setTitle('Task content').setValue(message.getSubject()))
    .addWidget(CardService.newDatePicker().setFieldName('due_date').setTitle('Due date'));

  const projectPicker = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setFieldName('project_id').setTitle('Select a project');
  try {
    getProjects().forEach(p => {
      const name = p.name || p.title || 'Unnamed Project';
      projectPicker.addItem(name, String(p.id), name === 'Inbox');
    });
  } catch (err) { basicSection.addWidget(CardService.newTextParagraph().setText('Error loading projects.')); }
  basicSection.addWidget(projectPicker);
  card.addSection(basicSection);

  // Advanced Info Section (Collapsible)
  const advancedSection = CardService.newCardSection().setHeader('More task details').setCollapsible(true).setNumUncollapsibleWidgets(0);

  advancedSection.addWidget(CardService.newTimePicker().setFieldName('due_time').setTitle('Due time'));

  const durationPicker = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setFieldName('duration_val').setTitle('Duration');
  durationPicker.addItem('No duration', '0', true);
  [15, 30, 45, 60, 90, 120].forEach(min => durationPicker.addItem(`${min} minutes`, String(min), false));
  advancedSection.addWidget(durationPicker);

  const priorityPicker = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setFieldName('priority').setTitle('Priority');
  priorityPicker.addItem('P1', '4', false);
  priorityPicker.addItem('P2', '3', false);
  priorityPicker.addItem('P3', '2', false);
  priorityPicker.addItem('P4 (Default)', '1', true);
  advancedSection.addWidget(priorityPicker);

  const labelPicker = CardService.newSelectionInput().setType(CardService.SelectionInputType.CHECK_BOX).setFieldName('label_ids').setTitle('Select labels');
  try {
    getLabels().forEach(l => labelPicker.addItem(l.name, l.name, false));
  } catch (err) { console.error('Error loading labels', err); }
  advancedSection.addWidget(labelPicker);

  card.addSection(advancedSection);

  // Actions
  card.addSection(CardService.newCardSection().addWidget(
    CardService.newTextButton()
      .setText('Add task')
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setBackgroundColor('#db4c3f') // Todoist red
      .setOnClickAction(CardService.newAction().setFunctionName('handleCreateAndLink').setParameters({threadId, messageId}))
  ));

  return card.build();
}

function handleCreateAndLink(e) {
  const {threadId, messageId} = e.parameters;
  const {task_content, project_id, due_date, due_time, duration_val, priority} = e.formInput;
  const label_ids = e.formInputs.label_ids || [];
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);

  const options = {
    projectId: project_id,
    labelIds: label_ids,
    priority: priority
  };

  if (due_date) {
    const date = new Date(due_date.msSinceEpoch);
    options.dueDate = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');

    if (due_time) {
      options.dueTime = `${String(due_time.hours).padStart(2, '0')}:${String(due_time.minutes).padStart(2, '0')}`;
    }
  }

  if (duration_val && duration_val !== '0') {
    options.duration = duration_val;
    options.durationUnit = 'minute';
  }

  try {
    const task = createTask(task_content, options);
    const projects = getProjects();
    const projectName = projects.find(p => p.id === project_id)?.name || 'Unknown';
    performLink(threadId, messageId, task.id, task.content, projectName, true);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().popToRoot().updateCard(createMainCard(threadId, messageId, null, '', 'Successfully created and attached task!')))
      .build();
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
      const pId = String(task.project_id || '');
      const projectName = projectMap[pId] || 'Inbox';
      const content = task.content || task.text || task.title || 'Untitled Task';
      performLink(threadId, messageId, taskId, content, projectName, addCommentFlag === 'yes');
    });
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(createMainCard(threadId, messageId, null, '', `Successfully attached ${selectedTaskIds.length} tasks!`)))
      .build();
  } catch (err) { return showErrorCard('Attaching failed: ' + err.message); }
}

function performLink(threadId, messageId, taskId, taskTitle, projectName, shouldAddComment) {
  const message = GmailApp.getMessageById(messageId);
  const subject = message.getSubject();
  const sender = message.getFrom();
  const userEmail = Session.getActiveUser().getEmail();
  const threadUrl = 'https://mail.google.com/mail/u/0/#all/' + threadId;

  // Extract Internet Message-ID for reliable fallback search
  const internetMessageId = (message.getHeader('Message-ID') || '').replace(/[<>]/g, '');

  const linkData = {
    gmail_account: userEmail,
    gmail_thread_id: threadId,
    gmail_message_id: internetMessageId,
    gmail_subject: subject,
    gmail_sender: sender,
    gmail_url: threadUrl,
    todoist_task_id: taskId,
    todoist_task_title: taskTitle,
    todoist_project_name: projectName,
    linked_at: new Date()
  };

  StorageManager.addLink(linkData);

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
  StorageManager.deleteLink(threadId, taskId);
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popCard().updateCard(createMainCard(threadId, messageId, null, '', 'Successfully detached task.')))
    .build();
}

function goBackToMain(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popCard())
    .build();
}

function onSettings(e) {
  const card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Settings'));
  const section = CardService.newCardSection();
  const token = getTodoistToken() || '';
  const storageId = PropertiesService.getUserProperties().getProperty('STORAGE_SPREADSHEET_ID') || '';
  const backend = StorageManager.getBackend();
  const firestoreProj = PropertiesService.getScriptProperties().getProperty('FIRESTORE_PROJECT_ID') || '';

  section.addWidget(CardService.newTextInput().setFieldName('todoist_token').setTitle('Todoist API Token').setValue(token));

  const backendPicker = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('storage_backend')
    .setTitle('Storage Backend')
    .addItem('Google Sheets', 'sheets', backend === 'sheets')
    .addItem('Google Firestore', 'firestore', backend === 'firestore');
  section.addWidget(backendPicker);

  section.addWidget(CardService.newTextInput().setFieldName('storage_id').setTitle('Storage Spreadsheet ID').setHint('For Sheets backend').setValue(storageId));
  section.addWidget(CardService.newTextInput().setFieldName('firestore_project').setTitle('Firestore Project ID').setHint('For Firestore backend').setValue(firestoreProj));

  section.addWidget(CardService.newTextButton().setText('Save Settings').setOnClickAction(CardService.newAction().setFunctionName('saveSettings')));
  card.addSection(section);
  // Universal actions must return an array of cards.
  return [card.build()];
}

function saveSettings(e) {
  const token = e.formInput.todoist_token;
  const storageId = e.formInput.storage_id;
  const backend = e.formInput.storage_backend;
  const firestoreProj = e.formInput.firestore_project;

  const userProps = PropertiesService.getUserProperties();
  const scriptProps = PropertiesService.getScriptProperties();

  if (token) userProps.setProperty('TODOIST_API_TOKEN', token);
  if (storageId) userProps.setProperty('STORAGE_SPREADSHEET_ID', storageId);
  else userProps.deleteProperty('STORAGE_SPREADSHEET_ID');

  if (backend) scriptProps.setProperty('STORAGE_BACKEND', backend);
  if (firestoreProj) scriptProps.setProperty('FIRESTORE_PROJECT_ID', firestoreProj);

  return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText('Settings saved')).build();
}

function showErrorCard(message) {
  const card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Error'));
  card.addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText(message)));
  return card.build();
}
