/**
 * Storage Logic
 *
 * We map Gmail Thread IDs to lists of Todoist Task IDs.
 * Since UserProperties stores strings, we JSON stringify the lists.
 */

const THREAD_PREFIX = 'thread_';

/**
 * Gets the list of linked Todoist Task IDs for a Gmail Thread ID.
 */
function getLinkedTaskIds(threadId) {
  const property = PropertiesService.getUserProperties().getProperty(THREAD_PREFIX + threadId);
  if (property) {
    try {
      return JSON.parse(property);
    } catch (e) {
      console.error('Error parsing linked tasks', e);
      return [];
    }
  }
  return [];
}

/**
 * Links a Todoist Task ID to a Gmail Thread ID.
 */
function linkTaskToThread(threadId, taskId) {
  const taskIds = getLinkedTaskIds(threadId);
  if (taskIds.indexOf(taskId) === -1) {
    taskIds.push(taskId);
    PropertiesService.getUserProperties().setProperty(THREAD_PREFIX + threadId, JSON.stringify(taskIds));
  }
}

/**
 * Unlinks a Todoist Task ID from a Gmail Thread ID.
 */
function unlinkTaskFromThread(threadId, taskId) {
  let taskIds = getLinkedTaskIds(threadId);
  taskIds = taskIds.filter(id => id !== taskId);
  if (taskIds.length > 0) {
    PropertiesService.getUserProperties().setProperty(THREAD_PREFIX + threadId, JSON.stringify(taskIds));
  } else {
    PropertiesService.getUserProperties().deleteProperty(THREAD_PREFIX + threadId);
  }
}
