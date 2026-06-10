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
 * Fetches all items from a paginated endpoint.
 */
function fetchAllPaginated(endpoint, listKey) {
  let allItems = [];
  let cursor = null;
  let attempt = 0;

  do {
    const url = cursor ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}cursor=${cursor}` : endpoint;
    const response = callTodoistApi(url);
    attempt++;

    if (Array.isArray(response)) {
      allItems = allItems.concat(response);
      cursor = null;
    } else if (response && typeof response === 'object') {
      const items = response[listKey] || response.results || response.items || response.data || response.list;
      if (Array.isArray(items)) {
        allItems = allItems.concat(items);
      } else {
        // Check if it's a map of objects (e.g. { "id1": {...}, "id2": {...} })
        const values = Object.values(response);
        if (values.length > 0 && typeof values[0] === 'object' && (values[0].id || values[0].content || values[0].text || values[0].name)) {
          allItems = allItems.concat(values);
        } else {
          // Aggressive fallback: find any array in the response
          let found = false;
          for (let key in response) {
            if (Array.isArray(response[key])) {
              allItems = allItems.concat(response[key]);
              found = true;
              break;
            }
          }
          if (!found && attempt === 1) {
            console.warn('No array or map of objects found in response for ' + endpoint, response);
          }
        }
      }
      cursor = response.next_cursor || null;
    } else {
      cursor = null;
    }

    if (allItems.length > 5000) break; // Safety break

  } while (cursor);

  return allItems;
}

/**
 * Fetches all active tasks.
 */
function getActiveTasks() {
  return fetchAllPaginated('/tasks', 'tasks');
}

/**
 * Fetches all projects.
 */
function getProjects() {
  return fetchAllPaginated('/projects', 'projects');
}

/**
 * Fetches a specific task by ID.
 */
function getTask(taskId) {
  try {
    return callTodoistApi('/tasks/' + taskId);
  } catch (e) {
    // If task not found (404), it might be completed.
    if (e.message.indexOf('404') !== -1) {
      return { is_completed: true, content: 'Completed Task', id: taskId };
    }
    throw e;
  }
}

/**
 * Creates a new task with enhanced options.
 */
function createTask(content, options = {}) {
  const payload = { content: content };
  if (options.projectId) payload.project_id = options.projectId;
  if (options.labelIds && options.labelIds.length > 0) payload.labels = options.labelIds;
  if (options.priority) payload.priority = parseInt(options.priority);
  if (options.dueDate) {
    if (options.dueTime) {
      // Format: YYYY-MM-DDTHH:MM:SS
      payload.due_datetime = options.dueDate + 'T' + options.dueTime + ':00';
    } else {
      payload.due_date = options.dueDate;
    }
  }
  if (options.duration && options.durationUnit) {
    payload.duration = parseInt(options.duration);
    payload.duration_unit = options.durationUnit;
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
  return fetchAllPaginated('/labels', 'labels');
}

/**
 * Searches and sorts tasks based on relevance.
 */
function searchTasksEnhanced(query, subject = '', sender = '', threadId = '') {
  const tasks = getActiveTasks();
  const projects = getProjects();
  const projectMap = {};

  projects.forEach(p => {
    const id = String(p.id || p.uuid || p.v2_id || '');
    const name = p.name || p.title || p.text || 'Unknown Project';
    if (id) projectMap[id] = name;
  });

  let filtered = tasks;
  if (query) {
    const lowerQuery = query.toLowerCase();
    filtered = tasks.filter(task => {
      const content = (task.content || task.text || task.title || task.name || task.summary || '').toLowerCase();
      return content.indexOf(lowerQuery) !== -1;
    });
  }

  let links = [];
  if (threadId) {
    try {
      links = StorageManager.getLinksForThread(threadId);
    } catch (e) {
      console.warn('Could not load existing links for relevance scoring', e);
    }
  }
  const linkedTaskIds = links.map(l => String(l.todoist_task_id));
  const lowerSubject = subject ? subject.toLowerCase() : '';
  const lowerSender = sender ? sender.toLowerCase() : '';

  filtered.forEach(task => {
    const tId = String(task.id || task.uuid || task.v2_id || '');
    const pId = String(task.project_id || '');

    task.task_id = tId;
    task.project_name = projectMap[pId] || 'Inbox';
    task.task_content = task.content || task.text || task.title || task.name || task.summary || 'Untitled Task';

    let score = 0;
    const content = task.task_content.toLowerCase();
    if (lowerSubject && content.includes(lowerSubject)) score += 10;
    if (lowerSender && content.includes(lowerSender)) score += 5;
    if (lowerSubject && task.project_name.toLowerCase().includes(lowerSubject)) score += 3;
    if (linkedTaskIds.includes(tId)) score += 20;

    const today = new Date().toISOString().split('T')[0];
    const due = task.due;
    const dueDate = due ? (due.date || (typeof due === 'string' ? due : null)) : null;
    if (dueDate && dueDate.startsWith(today)) score += 15;
    else if (dueDate && dueDate > today) score += 5;

    task.relevance_score = score;
  });

  filtered.sort((a, b) => {
    if (b.relevance_score !== a.relevance_score) return b.relevance_score - a.relevance_score;
    const getDue = (t) => {
      const d = t.due;
      return (d ? (d.date || (typeof d === 'string' ? d : null)) : null) || '9999-12-31';
    };
    const dueA = getDue(a);
    const dueB = getDue(b);
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
    const projects = getProjects();
    const tasks = getActiveTasks();
    const labels = getLabels();
    return {
      success: true,
      message: 'Connected to Unified API v1',
      projectCount: projects.length,
      taskCount: tasks.length,
      labelCount: labels.length
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
}
