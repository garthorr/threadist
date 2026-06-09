/**
 * Todoist API Integration
 */

var TODOIST_API_BASE = 'https://api.todoist.com/api/v1';

/**
 * Returns the Todoist API token from UserProperties.
 */
function getTodoistToken() {
  return PropertiesService.getUserProperties().getProperty('TODOIST_API_TOKEN');
}

/**
 * Sets the Todoist API token in UserProperties.
 */
function setTodoistToken(token) {
  PropertiesService.getUserProperties().setProperty('TODOIST_API_TOKEN', token);
}

/**
 * Makes a request to the Todoist API.
 */
function callTodoistApi(endpoint, method = 'GET', payload = null) {
  let token = getTodoistToken();
  if (!token) {
    throw new Error('Todoist API token not set. Please go to Settings to configure it.');
  }

  // Sanitize token: remove whitespace and any accidental "Bearer " prefix
  token = token.trim();
  if (token.toLowerCase().startsWith('bearer ')) {
    token = token.substring(7).trim();
  }

  const options = {
    method: method.toUpperCase(),
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/json'
    },
    muteHttpExceptions: true
  };

  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  const url = TODOIST_API_BASE + endpoint;
  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseContent = response.getContentText();

  if (responseCode >= 200 && responseCode < 300) {
    return responseContent ? JSON.parse(responseContent) : null;
  } else {
    console.error('Todoist API Error:', {
      endpoint: endpoint,
      method: method,
      code: responseCode,
      body: responseContent
    });

    let userMsg = `Todoist API Error (Status ${responseCode})`;
    try {
      const errorJson = JSON.parse(responseContent);
      if (errorJson.error) {
        userMsg += `: ${errorJson.error}`;
      } else if (typeof errorJson === 'string') {
        userMsg += `: ${errorJson}`;
      }
    } catch (e) {
      if (responseContent) {
        userMsg += `: ${responseContent.substring(0, 100)}`;
      }
    }

    if (responseCode === 401) {
      userMsg = 'Todoist Authentication Failed: The API token is invalid or expired. Please update it in Settings.';
    } else if (responseCode === 403) {
      userMsg = 'Todoist Access Forbidden: You do not have permission for this action.';
    }

    throw new Error(userMsg);
  }
}

/**
 * Fetches all active tasks.
 */
function getActiveTasks() {
  const tasks = callTodoistApi('/tasks');
  return Array.isArray(tasks) ? tasks : [];
}

/**
 * Fetches all projects.
 */
function getProjects() {
  const projects = callTodoistApi('/projects');
  return Array.isArray(projects) ? projects : [];
}

/**
 * Fetches a specific task by ID.
 */
function getTask(taskId) {
  return callTodoistApi('/tasks/' + taskId);
}

/**
 * Creates a new task.
 */
function createTask(content, projectId = null) {
  const payload = { content: content };
  if (projectId) {
    payload.project_id = projectId;
  }
  return callTodoistApi('/tasks', 'POST', payload);
}

/**
 * Searches and sorts tasks based on relevance.
 */
function searchTasksEnhanced(query, subject = '', sender = '', threadId = '') {
  const tasks = getActiveTasks();
  const projects = getProjects();
  const projectMap = {};
  projects.forEach(p => projectMap[p.id] = p.name);

  let filtered = tasks;
  if (query) {
    const lowerQuery = query.toLowerCase();
    filtered = tasks.filter(task => task.content.toLowerCase().indexOf(lowerQuery) !== -1);
  }

  // Get recently linked task IDs to prioritize them
  const links = getLinksForThread(threadId);
  const linkedTaskIds = links.map(l => String(l.todoist_task_id));

  const lowerSubject = subject ? subject.toLowerCase() : '';
  const lowerSender = sender ? sender.toLowerCase() : '';

  // Enrich with project name and relevance score
  filtered.forEach(task => {
    task.project_name = projectMap[task.project_id] || 'Inbox';

    let score = 0;
    // Prioritize tasks whose title/project matches email subject/sender
    if (lowerSubject && task.content.toLowerCase().includes(lowerSubject)) score += 10;
    if (lowerSender && task.content.toLowerCase().includes(lowerSender)) score += 5;
    if (lowerSubject && task.project_name.toLowerCase().includes(lowerSubject)) score += 3;

    // Recently linked tasks for this thread get a boost
    if (linkedTaskIds.includes(String(task.id))) score += 20;

    // Prioritize tasks due today/upcoming
    const today = new Date().toISOString().split('T')[0];
    if (task.due && task.due.date === today) score += 15;
    else if (task.due && task.due.date > today) score += 5;

    task.relevance_score = score;
  });

  // Sort: Relevance score (descending), then due date (ascending), then priority (descending)
  filtered.sort((a, b) => {
    if (b.relevance_score !== a.relevance_score) return b.relevance_score - a.relevance_score;

    const dueA = a.due ? a.due.date : '9999-12-31';
    const dueB = b.due ? b.due.date : '9999-12-31';
    if (dueA !== dueB) return dueA < dueB ? -1 : 1;

    return b.priority - a.priority;
  });

  return filtered;
}

/**
 * Adds a comment to a task.
 */
function addComment(taskId, content) {
  return callTodoistApi('/comments', 'POST', {
    task_id: taskId,
    content: content
  });
}
