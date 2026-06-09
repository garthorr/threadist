/**
 * Todoist API Integration
 */

const TODOIST_API_BASE = 'https://api.todoist.com/rest/v2';

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
function callTodoistApi(endpoint, method = 'get', payload = null) {
  const token = getTodoistToken();
  if (!token) {
    throw new Error('Todoist API token not set');
  }

  const options = {
    method: method,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };

  if (payload) {
    options.payload = JSON.stringify(payload);
  }

  const url = TODOIST_API_BASE + endpoint;
  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseContent = response.getContentText();

  if (responseCode >= 200 && responseCode < 300) {
    return responseContent ? JSON.parse(responseContent) : null;
  } else {
    console.error('Todoist API error', responseCode, responseContent);
    throw new Error('Todoist API error: ' + responseContent);
  }
}

/**
 * Fetches all active tasks.
 */
function getActiveTasks() {
  return callTodoistApi('/tasks');
}

/**
 * Fetches a specific task by ID.
 */
function getTask(taskId) {
  return callTodoistApi('/tasks/' + taskId);
}

/**
 * Searches for tasks by content.
 * Note: Todoist REST API doesn't have a direct "search" endpoint for tasks by text,
 * so we fetch active tasks and filter them.
 */
function searchTasks(query) {
  const tasks = getActiveTasks();
  if (!query) return tasks;

  const lowerQuery = query.toLowerCase();
  return tasks.filter(task => task.content.toLowerCase().indexOf(lowerQuery) !== -1);
}

/**
 * Adds a comment to a task.
 */
function addComment(taskId, content) {
  return callTodoistApi('/comments', 'post', {
    task_id: taskId,
    content: content
  });
}
