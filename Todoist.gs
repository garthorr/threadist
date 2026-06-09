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

  // Sanitize token
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
    console.error('Todoist API Error:', { endpoint, method, code: responseCode, body: responseContent });

    let userMsg = `Todoist API Error (Status ${responseCode})`;
    try {
      const errorJson = JSON.parse(responseContent);
      userMsg += `: ${errorJson.error || errorJson.message || responseContent}`;
    } catch (e) {
      if (responseContent) userMsg += `: ${responseContent.substring(0, 100)}`;
    }

    if (responseCode === 401) userMsg = 'Todoist Authentication Failed: Invalid API token.';
    if (responseCode === 403) userMsg = 'Todoist Access Forbidden.';
    if (responseCode === 410) userMsg = 'Todoist API Deprecated: The current version of this add-on is using an outdated API endpoint.';

    throw new Error(userMsg);
  }
}

/**
 * Helper to extract a list of items from various response structures.
 */
function extractList(response, listKey) {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (typeof response === 'object') {
    // Check specific key, then results, then items, then data, then any array property
    const array = response[listKey] || response.results || response.items || response.data;
    if (Array.isArray(array)) return array;

    // If it's a map of objects, convert to array
    for (let key in response) {
      if (Array.isArray(response[key])) return response[key];
    }
  }
  return [];
}

/**
 * Fetches all active tasks.
 */
function getActiveTasks() {
  const response = callTodoistApi('/tasks');
  return extractList(response, 'tasks');
}

/**
 * Fetches all projects.
 */
function getProjects() {
  const response = callTodoistApi('/projects');
  return extractList(response, 'projects');
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
function createTask(content, projectId = null, labelIds = []) {
  const payload = { content: content };
  if (projectId) {
    payload.project_id = projectId;
  }
  if (labelIds && labelIds.length > 0) {
    payload.labels = labelIds;
  }
  return callTodoistApi('/tasks', 'POST', payload);
}

/**
 * Completes a task.
 */
function closeTask(taskId) {
  return callTodoistApi('/tasks/' + taskId + '/close', 'POST');
}

/**
 * Fetches all labels.
 */
function getLabels() {
  const response = callTodoistApi('/labels');
  return extractList(response, 'labels');
}

/**
 * Searches and sorts tasks based on relevance.
 */
function searchTasksEnhanced(query, subject = '', sender = '', threadId = '') {
  const tasks = getActiveTasks();
  const projects = getProjects();
  const projectMap = {};
  projects.forEach(p => {
    const id = p.id;
    const name = p.name || p.title || 'Unknown Project';
    projectMap[id] = name;
  });

  let filtered = tasks;
  if (query) {
    const lowerQuery = query.toLowerCase();
    filtered = tasks.filter(task => {
      const content = (task.content || task.text || '').toLowerCase();
      return content.indexOf(lowerQuery) !== -1;
    });
  }

  const links = getLinksForThread(threadId);
  const linkedTaskIds = links.map(l => String(l.todoist_task_id));
  const lowerSubject = subject ? subject.toLowerCase() : '';
  const lowerSender = sender ? sender.toLowerCase() : '';

  filtered.forEach(task => {
    task.project_name = projectMap[task.project_id] || 'Inbox';
    task.task_content = task.content || task.text || 'Untitled Task';

    let score = 0;
    const content = task.task_content.toLowerCase();
    if (lowerSubject && content.includes(lowerSubject)) score += 10;
    if (lowerSender && content.includes(lowerSender)) score += 5;
    if (lowerSubject && task.project_name.toLowerCase().includes(lowerSubject)) score += 3;
    if (linkedTaskIds.includes(String(task.id))) score += 20;

    const today = new Date().toISOString().split('T')[0];
    const dueDate = task.due ? (task.due.date || task.due) : null;
    if (dueDate === today) score += 15;
    else if (dueDate && dueDate > today) score += 5;

    task.relevance_score = score;
  });

  filtered.sort((a, b) => {
    if (b.relevance_score !== a.relevance_score) return b.relevance_score - a.relevance_score;
    const dueA = (a.due && (a.due.date || a.due)) || '9999-12-31';
    const dueB = (b.due && (b.due.date || b.due)) || '9999-12-31';
    if (dueA !== dueB) return dueA < dueB ? -1 : 1;
    return (b.priority || 0) - (a.priority || 0);
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

/**
 * Tests connectivity to Todoist API.
 */
function testConnectivity() {
  try {
    callTodoistApi('/projects');
    return { success: true, message: 'Connected' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}
