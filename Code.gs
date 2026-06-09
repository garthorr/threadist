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
    const thread = message.getThread();
    const threadId = thread.getId();

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
  const sender = message.getFrom();
  const userEmail = Session.getActiveUser().getEmail();

  const card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle('Threadist').setSubtitle('Gmail to Todoist'));

  if (statusMsg) {
    card.addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText('<b>' + statusMsg + '</b>')));
  }

  // Check for Token
  if (!getTodoistToken()) {
    const setupSection = CardService.newCardSection()
      .setHeader('Configuration Required')
      .addWidget(CardService.newTextParagraph().setText('Please configure your Todoist API token in Settings to start linking emails to tasks.'));
    card.addSection(setupSection);
  }

  // Section 1: Email Metadata
  const metaSection = CardService.newCardSection()
    .setHeader('Email Details')
    .setCollapsible(true)
    .setNumUncollapsibleWidgets(1)
    .addWidget(CardService.newDecoratedText().setTopLabel('Subject').setText(subject).setWrapText(true))
    .addWidget(CardService.newDecoratedText().setTopLabel('Sender').setText(sender))
    .addWidget(CardService.newDecoratedText().setTopLabel('Account').setText(userEmail))
    .addWidget(CardService.newDecoratedText().setTopLabel('Thread ID').setText(threadId));

  card.addSection(metaSection);

  // Section 2: Linked Tasks
  const linkedSection = CardService.newCardSection().setHeader('Linked Todoist Tasks');
  const links = getLinksForThread(threadId);

  if (links.length === 0) {
    linkedSection.addWidget(CardService.newTextParagraph().setText('No tasks linked to this thread.'));
  } else {
    links.forEach(link => {
      const taskText = `<b>${link.todoist_task_title}</b>\n<i>Project: ${link.todoist_project_name}</i>`;
      linkedSection.addWidget(
        CardService.newDecoratedText()
          .setText(taskText)
          .setWrapText(true)
          .setButton(
            CardService.newTextButton()
              .setText('Open')
              .setOpenLink(CardService.newOpenLink().setUrl('https://todoist.com/showTask?id=' + link.todoist_task_id))
          )
      );
      linkedSection.addWidget(
        CardService.newTextButton()
          .setText('Unlink')
          .setOnClickAction(CardService.newAction().setFunctionName('confirmUnlink').setParameters({threadId: threadId, taskId: String(link.todoist_task_id), messageId: messageId}))
      );
    });
  }
  card.addSection(linkedSection);

  // Section 3: Create New Task Shortcut
  const createSection = CardService.newCardSection().setHeader('Quick Actions');
  createSection.addWidget(
    CardService.newTextButton()
      .setText('Create New Task From Email')
      .setOnClickAction(CardService.newAction().setFunctionName('showCreateTaskCard').setParameters({threadId: threadId, messageId: messageId}))
  );
  card.addSection(createSection);

  // Section 4: Search and Link
  const searchSection = CardService.newCardSection().setHeader('Link Existing Task');

  const searchInput = CardService.newTextInput()
    .setFieldName('search_query')
    .setTitle('Search Todoist Tasks')
    .setHint('Search by name')
    .setSuggestions(CardService.newSuggestions().addSuggestions(['Today', 'Inbox', 'Priority 1']));

  if (query) {
    searchInput.setValue(query);
  }

  searchSection.addWidget(searchInput);
  searchSection.addWidget(
    CardService.newTextButton()
      .setText('Search')
      .setOnClickAction(CardService.newAction().setFunctionName('handleSearch').setParameters({threadId: threadId, messageId: messageId}))
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
        .setTitle('Select tasks to link');

      let itemCount = 0;
      searchResults.slice(0, 15).forEach(task => {
        const isLinked = links.some(l => String(l.todoist_task_id) === String(task.id));
        if (!isLinked) {
          const content = task.task_content || task.content || task.text || 'Untitled Task';
          const dueData = task.due ? (task.due.date || task.due) : null;
          const due = dueData ? ` (Due: ${dueData})` : '';
          selectionInput.addItem(`${content} [${task.project_name}]${due}`, String(task.id), false);
          itemCount++;
        }
      });

      if (itemCount > 0) {
        searchSection.addWidget(selectionInput);
        searchSection.addWidget(
          CardService.newTextButton()
            .setText('Attach Selected Tasks')
            .setOnClickAction(CardService.newAction().setFunctionName('handleMultiLink').setParameters({threadId: threadId, messageId: messageId}))
        );
      } else {
        searchSection.addWidget(CardService.newTextParagraph().setText('All found tasks are already linked or no results matching.'));
      }
    }
  }

  card.addSection(searchSection);

  return card.build();
}

/**
 * Shows the Create Task card.
 */
function showCreateTaskCard(e) {
  const threadId = e.parameters.threadId;
  const messageId = e.parameters.messageId;
  const accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  const message = GmailApp.getMessageById(messageId);

  const card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle('Create New Todoist Task'));

  const section = CardService.newCardSection();

  section.addWidget(
    CardService.newTextInput()
      .setFieldName('task_content')
      .setTitle('Task Title')
      .setValue(message.getSubject())
  );

  const projectPicker = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('project_id')
    .setTitle('Project');

  try {
    const projects = getProjects();
    if (projects.length === 0) {
      section.addWidget(CardService.newTextParagraph().setText('<i>No projects found in your Todoist account.</i>'));
    }
    projects.forEach(p => {
      const name = p.name || p.title || 'Untitled Project';
      projectPicker.addItem(name, p.id, name === 'Inbox');
    });
  } catch (err) {
    section.addWidget(CardService.newTextParagraph().setText('Error loading projects.'));
  }

  section.addWidget(projectPicker);
  section.addWidget(
    CardService.newTextButton()
      .setText('Create & Link')
      .setOnClickAction(CardService.newAction().setFunctionName('handleCreateAndLink').setParameters({threadId: threadId, messageId: messageId}))
  );

  card.addSection(section);
  return card.build();
}

/**
 * Handles creation and linking.
 */
function handleCreateAndLink(e) {
  const threadId = e.parameters.threadId;
  const messageId = e.parameters.messageId;
  const content = e.formInput.task_content;
  const projectId = e.formInput.project_id;

  const accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  try {
    const task = createTask(content, projectId);
    const projects = getProjects();
    const projectName = projects.find(p => p.id === projectId)?.name || 'Unknown';

    performLink(threadId, messageId, task.id, task.content, projectName, true);

    return CardService.newNavigation().popToRoot().updateCard(createMainCard(threadId, messageId, null, '', 'Successfully created and linked task!'));
  } catch (err) {
    return showErrorCard('Failed to create task: ' + err.message);
  }
}

/**
 * Handles multi-link action.
 */
function handleMultiLink(e) {
  const threadId = e.parameters.threadId;
  const messageId = e.parameters.messageId;
  const selectedTaskIds = e.formInputs.selected_tasks;
  const addCommentFlag = e.formInput.add_comment;

  if (!selectedTaskIds || selectedTaskIds.length === 0) {
    return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText('No tasks selected')).build();
  }

  const accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  try {
    const projects = getProjects();
    const projectMap = {};
    projects.forEach(p => projectMap[p.id] = p.name);

    selectedTaskIds.forEach(taskId => {
      const task = getTask(taskId);
      const projectName = projectMap[task.project_id] || 'Inbox';
      performLink(threadId, messageId, taskId, task.content, projectName, addCommentFlag === 'yes');
    });

    return CardService.newNavigation().updateCard(createMainCard(threadId, messageId, null, '', `Successfully linked ${selectedTaskIds.length} tasks!`));
  } catch (err) {
    return showErrorCard('Linking failed: ' + err.message);
  }
}

/**
 * Helper to perform linking and storage.
 */
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
    } catch (err) {
      console.error('Failed to add comment', err);
    }
  }
}

/**
 * Handles search action.
 */
function handleSearch(e) {
  const threadId = e.parameters.threadId;
  const messageId = e.parameters.messageId;
  const query = e.formInput.search_query;
  const accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  try {
    const message = GmailApp.getMessageById(messageId);
    const results = searchTasksEnhanced(query, message.getSubject(), message.getFrom(), threadId);
    return CardService.newNavigation().updateCard(createMainCard(threadId, messageId, results, query));
  } catch (err) {
    return showErrorCard('Search failed: ' + err.message);
  }
}

/**
 * Shows confirmation for unlinking.
 */
function confirmUnlink(e) {
  const threadId = e.parameters.threadId;
  const taskId = e.parameters.taskId;
  const messageId = e.parameters.messageId;

  const card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle('Confirm Unlink'));

  const section = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText('Are you sure you want to unlink this task? This will not delete the task from Todoist.'))
    .addWidget(
      CardService.newTextButton()
        .setText('Yes, Unlink')
        .setOnClickAction(CardService.newAction().setFunctionName('handleUnlinkConfirmed').setParameters({threadId: threadId, taskId: taskId, messageId: messageId}))
    )
    .addWidget(
      CardService.newTextButton()
        .setText('Cancel')
        .setOnClickAction(CardService.newAction().setFunctionName('goBackToMain').setParameters({threadId: threadId, messageId: messageId}))
    );

  card.addSection(section);
  return card.build();
}

/**
 * Handles unlink confirmed.
 */
function handleUnlinkConfirmed(e) {
  const threadId = e.parameters.threadId;
  const taskId = e.parameters.taskId;
  const messageId = e.parameters.messageId;

  deleteLink(threadId, taskId);

  const accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  return CardService.newNavigation().popCard().updateCard(createMainCard(threadId, messageId, null, '', 'Successfully unlinked task.'));
}

function goBackToMain(e) {
  return CardService.newNavigation().popCard();
}

/**
 * Settings Card.
 */
function onSettings(e) {
  const card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle('Settings'));

  const section = CardService.newCardSection();
  const token = getTodoistToken() || '';

  section.addWidget(
    CardService.newTextInput()
      .setFieldName('todoist_token')
      .setTitle('Todoist API Token')
      .setHint('Get this from Todoist Settings > Integrations')
      .setValue(token)
  );

  section.addWidget(
    CardService.newTextButton()
      .setText('Save Token')
      .setOnClickAction(CardService.newAction().setFunctionName('saveSettings'))
  );

  card.addSection(section);
  return card.build();
}

/**
 * Saves settings.
 */
function saveSettings(e) {
  const token = e.formInput.todoist_token;
  setTodoistToken(token);
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('Settings saved'))
    .build();
}

/**
 * Error Card helper.
 */
function showErrorCard(message) {
  const card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle('Error'));
  card.addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText(message)));
  return card.build();
}
