/**
 * Main UI Logic for Threadist Gmail Add-on
 */

/**
 * Entry point for Gmail contextual trigger.
 */
function onGmailMessage(e) {
  const messageId = e.gmail.messageId;
  const accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  const message = GmailApp.getMessageById(messageId);
  const thread = message.getThread();
  const threadId = thread.getId();

  return createMainCard(threadId, message);
}

/**
 * Creates the main contextual card.
 */
function createMainCard(threadId, message, searchResults = null, query = '') {
  const subject = message.getSubject();
  const sender = message.getFrom();
  const userEmail = Session.getActiveUser().getEmail();

  const card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle('Threadist').setSubtitle('Link Gmail to Todoist'));

  // Section 1: Email Metadata
  const metaSection = CardService.newCardSection()
    .setHeader('Email Details')
    .addWidget(CardService.newKeyValue().setTopLabel('Subject').setContent(subject).setMultiline(true))
    .addWidget(CardService.newKeyValue().setTopLabel('Sender').setContent(sender))
    .addWidget(CardService.newKeyValue().setTopLabel('Thread ID').setContent(threadId))
    .addWidget(CardService.newKeyValue().setTopLabel('Account').setContent(userEmail));

  card.addSection(metaSection);

  // Section 2: Linked Tasks
  const linkedSection = CardService.newCardSection().setHeader('Linked Todoist Tasks');
  const linkedTaskIds = getLinkedTaskIds(threadId);

  if (linkedTaskIds.length === 0) {
    linkedSection.addWidget(CardService.newTextParagraph().setText('No tasks linked to this thread.'));
  } else {
    linkedTaskIds.forEach(taskId => {
      try {
        const task = getTask(taskId);
        linkedSection.addWidget(
          CardService.newKeyValue()
            .setContent(task.content)
            .setBottomLabel('Status: ' + (task.is_completed ? 'Completed' : 'Open'))
            .setButton(
              CardService.newTextButton()
                .setText('Unlink')
                .setOnClickAction(CardService.newAction().setFunctionName('handleUnlink').setParameters({threadId: threadId, taskId: taskId}))
            )
        );
      } catch (e) {
        linkedSection.addWidget(CardService.newTextParagraph().setText('Error loading task: ' + taskId));
      }
    });
  }
  card.addSection(linkedSection);

  // Section 3: Search and Link
  const searchSection = CardService.newCardSection().setHeader('Link New Task');

  const searchInput = CardService.newTextInput()
    .setFieldName('search_query')
    .setTitle('Search Todoist Tasks')
    .setHint('Enter task name');

  if (query) {
    searchInput.setValue(query);
  }

  searchSection.addWidget(searchInput);
  searchSection.addWidget(
    CardService.newTextButton()
      .setText('Search')
      .setOnClickAction(CardService.newAction().setFunctionName('handleSearch').setParameters({threadId: threadId}))
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

      searchResults.slice(0, 10).forEach(task => {
        const isLinked = linkedTaskIds.indexOf(task.id) !== -1;
        if (!isLinked) {
          searchSection.addWidget(
            CardService.newKeyValue()
              .setContent(task.content)
              .setButton(
                CardService.newTextButton()
                  .setText('Link')
                  .setOnClickAction(CardService.newAction().setFunctionName('handleLink').setParameters({threadId: threadId, taskId: task.id}))
              )
          );
        }
      });
    }
  }

  card.addSection(searchSection);

  return card.build();
}

/**
 * Handles search action.
 */
function handleSearch(e) {
  const threadId = e.parameters.threadId;
  const query = e.formInput.search_query;
  const messageId = e.gmail.messageId;
  const accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  try {
    const results = searchTasks(query);
    const message = GmailApp.getMessageById(messageId);
    return CardService.newNavigation().updateCard(createMainCard(threadId, message, results, query));
  } catch (err) {
    return showErrorCard('Search failed. Check your API token in Settings.');
  }
}

/**
 * Handles link action.
 */
function handleLink(e) {
  const threadId = e.parameters.threadId;
  const taskId = e.parameters.taskId;
  const addCommentFlag = e.formInput.add_comment;
  const messageId = e.gmail.messageId;
  const accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  linkTaskToThread(threadId, taskId);

  // Optional: Add comment
  if (addCommentFlag && addCommentFlag.indexOf('yes') !== -1) {
    try {
      const message = GmailApp.getMessageById(messageId);
      const subject = message.getSubject();
      const threadUrl = 'https://mail.google.com/mail/u/0/#all/' + threadId;
      const comment = 'Linked Gmail Thread: ' + subject + '\nURL: ' + threadUrl;
      addComment(taskId, comment);
    } catch (err) {
      console.error('Failed to add comment', err);
    }
  }

  const message = GmailApp.getMessageById(messageId);
  return CardService.newNavigation().updateCard(createMainCard(threadId, message));
}

/**
 * Handles unlink action.
 */
function handleUnlink(e) {
  const threadId = e.parameters.threadId;
  const taskId = e.parameters.taskId;
  const messageId = e.gmail.messageId;
  const accessToken = e.gmail.accessToken;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  unlinkTaskFromThread(threadId, taskId);

  const message = GmailApp.getMessageById(messageId);
  return CardService.newNavigation().updateCard(createMainCard(threadId, message));
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
      .setHint('Paste your Todoist API token here')
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
