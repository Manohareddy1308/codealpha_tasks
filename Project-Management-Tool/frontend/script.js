// Relative API by default on Express (port 5000); fallback to port 5000 if opened on Live Server or other dev port
const API_BASE =
  window.location.port && window.location.port !== "5000"
    ? `${window.location.protocol}//${window.location.hostname || "127.0.0.1"}:5000`
    : "";

// Authentication Check
function getToken() {
  return localStorage.getItem("token");
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch (e) {
    return null;
  }
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "login.html";
}

// Redirect to login if unauthenticated
if (!getToken()) {
  window.location.href = "login.html";
}

// Helper to escape HTML and prevent XSS
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function updateHeaderUser(user) {
  if (!user) return;
  const profileNameEl = document.getElementById("profileName");
  const avatarEl = document.getElementById("avatar");
  const profileRoleEl = document.getElementById("profileRole");
  const settingsNameEl = document.getElementById("settingsName");
  const settingsRoleEl = document.getElementById("settingsRole");

  if (profileNameEl) profileNameEl.textContent = user.name || "User";
  if (profileRoleEl) profileRoleEl.textContent = user.email || "";

  const parts = String(user.name || "U").split(" ");
  const initials = ((parts[0] ? parts[0][0] : "") + (parts[1] ? parts[1][0] : "")).toUpperCase();
  if (avatarEl) avatarEl.textContent = initials || "CA";

  if (settingsNameEl) settingsNameEl.value = user.name || "";
  if (settingsRoleEl && !settingsRoleEl.value) settingsRoleEl.value = "Project Lead";
}

// Populate user profile info in header from cached storage
const currentUser = getUser();
if (currentUser) {
  updateHeaderUser(currentUser);
}

// Sync current user with server on load to ensure header matches active token
function syncCurrentUser() {
  const token = getToken();
  if (!token) return;

  fetch(API_BASE + "/api/auth/me", {
    headers: { Authorization: "Bearer " + token },
  })
    .then(function (res) {
      if (res.status === 401) {
        logout();
        return null;
      }
      return res.ok ? res.json() : null;
    })
    .then(function (freshUser) {
      if (freshUser) {
        localStorage.setItem("user", JSON.stringify(freshUser));
        updateHeaderUser(freshUser);
      }
    })
    .catch(function () {});
}

// Listen for storage changes across browser tabs/windows
window.addEventListener("storage", function (e) {
  if (e.key === "token" || e.key === "user") {
    if (!getToken()) {
      window.location.href = "login.html";
    } else {
      updateHeaderUser(getUser());
      loadInitialData();
    }
  }
});

// Logout button listener
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", logout);
}

// Persistent Application State
let projects = [];
let tasks = [];
let searchText = "";

const dashboardProjects = document.getElementById("dashboardProjects");
const dashboardTasks = document.getElementById("dashboardTasks");
const projectsGrid = document.getElementById("projectsGrid");
const tasksTable = document.getElementById("tasksTable");
const statsGrid = document.getElementById("statsGrid");
const taskProject = document.getElementById("taskProject");
const editTaskProject = document.getElementById("editTaskProject");
const searchInput = document.getElementById("searchInput");

function getProjectName(projectId) {
  const project = projects.find(function (item) {
    return item.id === Number(projectId);
  });
  return project ? project.name : "Unknown";
}

function toCanonicalStatus(status) {
  const s = String(status || "").toLowerCase().trim();
  if (s === "in progress" || s === "in-progress" || s === "progress") {
    return "in progress";
  }
  if (s === "done" || s === "completed") {
    return "done";
  }
  return "todo";
}

function formatStatus(status) {
  const s = toCanonicalStatus(status);
  if (s === "in progress") {
    return "In Progress";
  }
  if (s === "done") {
    return "Done";
  }
  return "To Do";
}

function formatPriority(priority) {
  const p = String(priority || "").toLowerCase();
  if (p === "high") return "High";
  if (p === "low") return "Low";
  return "Medium";
}

function statusClass(status) {
  const s = toCanonicalStatus(status);
  if (s === "in progress") {
    return "progress";
  }
  if (s === "done") {
    return "done";
  }
  return "todo";
}

function getProgress(projectId) {
  const projectTasks = tasks.filter(function (task) {
    return Number(task.projectId || task.project_id) === Number(projectId);
  });

  if (projectTasks.length === 0) {
    return 0;
  }

  const doneCount = projectTasks.filter(function (task) {
    return statusClass(task.status) === "done";
  }).length;

  return Math.round((doneCount / projectTasks.length) * 100);
}

function matchesSearch(text) {
  return String(text || "").toLowerCase().includes(searchText);
}

function getVisibleProjects() {
  return projects.filter(function (project) {
    return matchesSearch(project.name) || matchesSearch(project.description);
  });
}

function getVisibleTasks() {
  return tasks.filter(function (task) {
    return (
      matchesSearch(task.title) ||
      matchesSearch(task.projectName || getProjectName(task.projectId)) ||
      matchesSearch(task.priority) ||
      matchesSearch(task.status) ||
      matchesSearch(formatStatus(task.status))
    );
  });
}

function renderStats() {
  const done = tasks.filter(function (task) {
    return statusClass(task.status) === "done";
  }).length;
  const inProgress = tasks.filter(function (task) {
    return statusClass(task.status) === "progress";
  }).length;

  statsGrid.innerHTML =
    '<article class="stat"><h3>Projects</h3><p>' +
    projects.length +
    "</p></article>" +
    '<article class="stat"><h3>Total Tasks</h3><p>' +
    tasks.length +
    "</p></article>" +
    '<article class="stat"><h3>In Progress</h3><p>' +
    inProgress +
    "</p></article>" +
    '<article class="stat"><h3>Completed</h3><p>' +
    done +
    "</p></article>";
}

function projectCard(project) {
  const progress = getProgress(project.id);
  const statusSlug = (project.status || "active").toLowerCase().replace(/\s+/g, "-");
  const dueDateStr = project.due ? "Due " + project.due : "No due date";
  const taskCount = tasks.filter(function (task) {
    return Number(task.projectId || task.project_id) === Number(project.id);
  }).length;
  const memberCount = project.member_count !== undefined ? project.member_count : 1;

  return (
    '<article class="card" data-project-id="' + project.id + '">' +
    '<div class="card-header-row">' +
    '<h3>' + escapeHtml(project.name) + '</h3>' +
    '<span class="status-badge status-' + statusSlug + '">' + escapeHtml(project.status || "active") + '</span>' +
    '</div>' +
    '<p>' + escapeHtml(project.description || "No description provided.") + '</p>' +
    '<div class="progress-row"><span>Progress</span><strong>' + progress + '%</strong></div>' +
    '<div class="bar"><span style="width:' + progress + '%"></span></div>' +
    '<div class="meta"><span>' + dueDateStr + '</span><span>' + taskCount + ' tasks</span></div>' +
    '<div class="card-actions">' +
    '<button class="btn btn-sm btn-outline manage-members-btn" data-id="' + project.id + '">Members (' + memberCount + ')</button>' +
    '<button class="btn btn-sm btn-outline edit-project-btn" data-id="' + project.id + '">Edit</button>' +
    '<button class="btn btn-sm btn-danger delete-project-btn" data-id="' + project.id + '">Delete</button>' +
    '</div>' +
    '</article>'
  );
}

function renderProjectCards() {
  const visible = getVisibleProjects();
  const html =
    visible.length === 0
      ? '<p class="empty">' + (projects.length === 0 ? 'No projects yet. Click "Add Project" to create one.' : 'No projects match your search.') + '</p>'
      : visible
          .map(function (project) {
            return projectCard(project);
          })
          .join("");

  dashboardProjects.innerHTML = html;
  projectsGrid.innerHTML = html;
}

function taskRows(list) {
  if (list.length === 0) {
    return '<p class="empty">No tasks found.</p>';
  }

  const rows = list
    .map(function (task) {
      const commentCount = task.comment_count !== undefined ? Number(task.comment_count) : 0;
      return (
        "<tr>" +
        "<td>" +
        escapeHtml(task.title) +
        "</td>" +
        "<td>" +
        escapeHtml(task.projectName || getProjectName(task.projectId)) +
        "</td>" +
        "<td>" +
        escapeHtml(task.assigned_to_name || "Unassigned") +
        "</td>" +
        "<td>" +
        (task.due || "-") +
        "</td>" +
        '<td><span class="badge ' +
        task.priority +
        '">' +
        task.priority +
        "</span></td>" +
        '<td><span class="badge ' +
        statusClass(task.status) +
        '">' +
        formatStatus(task.status) +
        "</span></td>" +
        '<td class="task-actions">' +
        '<button class="btn btn-sm btn-outline task-comments-btn" data-id="' + task.id + '">Comments (' + commentCount + ')</button>' +
        '<button class="btn btn-sm btn-outline edit-task-btn" data-id="' + task.id + '">Edit</button>' +
        '<button class="btn btn-sm btn-danger delete-task-btn" data-id="' + task.id + '">Delete</button>' +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  return (
    "<table><thead><tr>" +
    "<th>Task</th><th>Project</th><th>Assigned To</th><th>Due Date</th><th>Priority</th><th>Status</th><th>Actions</th>" +
    "</tr></thead><tbody>" +
    rows +
    "</tbody></table>"
  );
}

function renderTasks() {
  const visible = getVisibleTasks();
  dashboardTasks.innerHTML = taskRows(visible.slice(0, 5));
  tasksTable.innerHTML = taskRows(visible);
}

function fillProjectSelect() {
  const options = projects
    .map(function (project) {
      return '<option value="' + project.id + '">' + escapeHtml(project.name) + "</option>";
    })
    .join("");

  if (taskProject) taskProject.innerHTML = options;
  if (editTaskProject) editTaskProject.innerHTML = options;
}

// Populate task assignee options based on project members
async function updateTaskAssignees(selectEl, projectId, selectedUserId) {
  if (!selectEl) return;
  selectEl.innerHTML = '<option value="">Unassigned</option>';
  if (!projectId) return;

  const token = getToken();
  if (!token) return;

  try {
    const res = await fetch(API_BASE + "/api/projects/" + projectId + "/members", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) return;
    const members = await res.json();
    let opts = '<option value="">Unassigned</option>';
    members.forEach(function (m) {
      const isSel = selectedUserId && Number(selectedUserId) === Number(m.id) ? " selected" : "";
      const roleText = m.is_owner ? "Owner" : m.role;
      opts += '<option value="' + m.id + '"' + isSel + '>' + escapeHtml(m.name) + ' (' + escapeHtml(roleText) + ')</option>';
    });
    selectEl.innerHTML = opts;
    if (selectedUserId) {
      selectEl.value = String(selectedUserId);
    }
  } catch (err) {
    console.error("Error loading project members for assignees:", err);
  }
}

if (taskProject) {
  taskProject.addEventListener("change", function () {
    const pId = taskProject.value;
    updateTaskAssignees(document.getElementById("taskAssignee"), pId, null);
  });
}

function renderAll() {
  renderStats();
  renderProjectCards();
  renderTasks();
  fillProjectSelect();
}

function showView(viewName) {
  document.querySelectorAll(".view").forEach(function (view) {
    view.classList.remove("active");
  });
  const viewEl = document.getElementById(viewName + "-view");
  if (viewEl) viewEl.classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("open");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("open");
}

document.querySelectorAll(".nav-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    showView(btn.dataset.view);
    document.getElementById("sidebar").classList.remove("open");
  });
});

document.getElementById("menuBtn").addEventListener("click", function () {
  document.getElementById("sidebar").classList.toggle("open");
});

document.getElementById("addProjectBtn").addEventListener("click", function () {
  openModal("projectModal");
});

document.getElementById("addTaskBtn").addEventListener("click", function () {
  if (projects.length === 0) {
    alert("Please create a project first before adding tasks.");
    return;
  }
  fillProjectSelect();
  if (taskProject && taskProject.value) {
    updateTaskAssignees(document.getElementById("taskAssignee"), taskProject.value, null);
  }
  openModal("taskModal");
});

document.querySelectorAll("[data-close]").forEach(function (btn) {
  btn.addEventListener("click", function () {
    closeModal(btn.dataset.close);
  });
});

searchInput.addEventListener("input", function () {
  searchText = searchInput.value.trim().toLowerCase();
  renderProjectCards();
  renderTasks();
});

// Create Project Form Listener
document.getElementById("projectForm").addEventListener("submit", async function (event) {
  event.preventDefault();

  const submitBtn = event.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.textContent : "Create Project";

  const name = document.getElementById("projectName").value.trim();
  const description = document.getElementById("projectDesc").value.trim();
  const due_date = document.getElementById("projectDue").value;

  if (!name) {
    alert("Please enter a project name.");
    return;
  }

  const token = getToken();
  if (!token) {
    logout();
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating...";
    }

    const response = await fetch(API_BASE + "/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        name: name,
        description: description,
        due_date: due_date || null,
      }),
    });

    if (response.status === 401) {
      logout();
      return;
    }

    if (!response.ok) {
      const errData = await response.json().catch(function () { return {}; });
      throw new Error(errData.error || "Failed to create project");
    }

    event.target.reset();
    closeModal("projectModal");
    await loadInitialData();
    showView("projects");
  } catch (err) {
    alert("Error creating project: " + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  }
});

// Edit Project Form Listener
document.getElementById("editProjectForm").addEventListener("submit", async function (event) {
  event.preventDefault();

  const submitBtn = event.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.textContent : "Save Changes";

  const projectId = document.getElementById("editProjectId").value;
  const name = document.getElementById("editProjectName").value.trim();
  const description = document.getElementById("editProjectDesc").value.trim();
  const due_date = document.getElementById("editProjectDue").value;
  const status = document.getElementById("editProjectStatus").value;

  if (!name) {
    alert("Please enter a project name.");
    return;
  }

  const token = getToken();
  if (!token) {
    logout();
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";
    }

    const response = await fetch(API_BASE + "/api/projects/" + projectId, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        name: name,
        description: description,
        due_date: due_date || null,
        status: status,
      }),
    });

    if (response.status === 401) {
      logout();
      return;
    }

    if (!response.ok) {
      const errData = await response.json().catch(function () { return {}; });
      throw new Error(errData.error || "Failed to update project");
    }

    closeModal("editProjectModal");
    await loadInitialData();
  } catch (err) {
    alert("Error updating project: " + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  }
});

// Create Task Form Listener
document.getElementById("taskForm").addEventListener("submit", async function (event) {
  event.preventDefault();

  const submitBtn = event.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.textContent : "Create Task";

  const title = document.getElementById("taskTitle").value.trim();
  const projectId = Number(document.getElementById("taskProject").value);
  const assigneeSelect = document.getElementById("taskAssignee");
  const assigned_to = assigneeSelect && assigneeSelect.value ? Number(assigneeSelect.value) : null;
  const due_date = document.getElementById("taskDue").value;
  const priority = document.getElementById("taskPriority").value;
  const status = toCanonicalStatus(document.getElementById("taskStatus").value);

  if (!title || !projectId) {
    alert("Please provide a task title and select a project.");
    return;
  }

  const token = getToken();
  if (!token) {
    logout();
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating...";
    }

    const response = await fetch(API_BASE + "/api/projects/" + projectId + "/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        title: title,
        assigned_to: assigned_to,
        due_date: due_date || null,
        priority: priority,
        status: status,
      }),
    });

    if (response.status === 401) {
      logout();
      return;
    }

    if (!response.ok) {
      const errData = await response.json().catch(function () { return {}; });
      throw new Error(errData.error || "Failed to create task");
    }

    event.target.reset();
    closeModal("taskModal");
    await loadInitialData();
    showView("tasks");
  } catch (err) {
    alert("Error creating task: " + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  }
});

// Edit Task Form Listener
document.getElementById("editTaskForm").addEventListener("submit", async function (event) {
  event.preventDefault();

  const submitBtn = event.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.textContent : "Save Changes";

  const taskId = document.getElementById("editTaskId").value;
  const title = document.getElementById("editTaskTitle").value.trim();
  const assigneeSelect = document.getElementById("editTaskAssignee");
  const assigned_to = assigneeSelect && assigneeSelect.value ? Number(assigneeSelect.value) : null;
  const due_date = document.getElementById("editTaskDue").value;
  const priority = document.getElementById("editTaskPriority").value;
  const status = toCanonicalStatus(document.getElementById("editTaskStatus").value);

  if (!title) {
    alert("Please enter a task title.");
    return;
  }

  const token = getToken();
  if (!token) {
    logout();
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";
    }

    const response = await fetch(API_BASE + "/api/tasks/" + taskId, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        title: title,
        assigned_to: assigned_to,
        due_date: due_date || null,
        priority: priority,
        status: status,
      }),
    });

    if (response.status === 401) {
      logout();
      return;
    }

    if (!response.ok) {
      const errData = await response.json().catch(function () { return {}; });
      throw new Error(errData.error || "Failed to update task");
    }

    closeModal("editTaskModal");
    await loadInitialData();
  } catch (err) {
    alert("Error updating task: " + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  }
});

// Global Click Delegation for Project and Task Actions
document.addEventListener("click", async function (e) {
  // Project Edit
  const editProjectBtn = e.target.closest(".edit-project-btn");
  if (editProjectBtn) {
    const projectId = Number(editProjectBtn.dataset.id);
    const project = projects.find(function (p) {
      return p.id === projectId;
    });

    if (project) {
      document.getElementById("editProjectId").value = project.id;
      document.getElementById("editProjectName").value = project.name;
      document.getElementById("editProjectDesc").value = project.description || "";
      document.getElementById("editProjectDue").value = project.due || "";
      document.getElementById("editProjectStatus").value = project.status || "active";
      openModal("editProjectModal");
    }
    return;
  }

  // Project Delete
  const deleteProjectBtn = e.target.closest(".delete-project-btn");
  if (deleteProjectBtn) {
    const projectId = Number(deleteProjectBtn.dataset.id);
    const project = projects.find(function (p) {
      return p.id === projectId;
    });

    const projectName = project ? project.name : "this project";
    if (!confirm('Are you sure you want to delete "' + projectName + '"? This will permanently delete the project and all its tasks.')) {
      return;
    }

    const token = getToken();
    if (!token) {
      logout();
      return;
    }

    try {
      deleteProjectBtn.disabled = true;
      deleteProjectBtn.textContent = "Deleting...";

      const response = await fetch(API_BASE + "/api/projects/" + projectId, {
        method: "DELETE",
        headers: {
          Authorization: "Bearer " + token,
        },
      });

      if (response.status === 401) {
        logout();
        return;
      }

      if (!response.ok) {
        const errData = await response.json().catch(function () { return {}; });
        throw new Error(errData.error || "Failed to delete project");
      }

      await loadInitialData();
    } catch (err) {
      alert("Error deleting project: " + err.message);
    } finally {
      deleteProjectBtn.disabled = false;
      deleteProjectBtn.textContent = "Delete";
    }
    return;
  }

  // Task Edit
  const editTaskBtn = e.target.closest(".edit-task-btn");
  if (editTaskBtn) {
    const taskId = Number(editTaskBtn.dataset.id);
    const task = tasks.find(function (t) {
      return t.id === taskId;
    });

    if (task) {
      fillProjectSelect();
      document.getElementById("editTaskId").value = task.id;
      document.getElementById("editTaskTitle").value = task.title;
      document.getElementById("editTaskProject").value = task.projectId;
      document.getElementById("editTaskDue").value = task.due || "";
      document.getElementById("editTaskPriority").value = task.priority;
      document.getElementById("editTaskStatus").value = toCanonicalStatus(task.status);
      updateTaskAssignees(document.getElementById("editTaskAssignee"), task.projectId, task.assigned_to);
      openModal("editTaskModal");
    }
    return;
  }

  // Manage Members Modal Open
  const manageMembersBtn = e.target.closest(".manage-members-btn");
  if (manageMembersBtn) {
    const projectId = Number(manageMembersBtn.dataset.id);
    const project = projects.find(function (p) {
      return p.id === projectId;
    });

    if (project) {
      const addForm = document.getElementById("addMemberForm");
      if (addForm) addForm.reset();
      activeMembersProjectId = projectId;
      const idInput = document.getElementById("memberProjectId");
      if (idInput) idInput.value = projectId;
      document.getElementById("membersModalTitle").textContent = project.name + " - Members";
      const feedbackEl = document.getElementById("memberAddFeedback");
      if (feedbackEl) {
        feedbackEl.textContent = "";
        feedbackEl.style.color = "";
      }
      openModal("membersModal");
      loadProjectMembers(projectId);
    }
    return;
  }

  // Remove Member
  const removeMemberBtn = e.target.closest(".remove-member-btn");
  if (removeMemberBtn) {
    const userId = Number(removeMemberBtn.dataset.userId);
    const userName = removeMemberBtn.dataset.name || "this member";
    const projectId = activeMembersProjectId;

    if (!projectId || !userId) return;

    if (!confirm('Are you sure you want to remove "' + userName + '" from this project?')) {
      return;
    }

    const token = getToken();
    if (!token) {
      logout();
      return;
    }

    try {
      removeMemberBtn.disabled = true;
      removeMemberBtn.textContent = "Removing...";

      const res = await fetch(API_BASE + "/api/projects/" + projectId + "/members/" + userId, {
        method: "DELETE",
        headers: {
          Authorization: "Bearer " + token,
        },
      });

      if (res.status === 401) {
        logout();
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(function () { return {}; });
        throw new Error(err.error || "Failed to remove member");
      }

      await loadProjectMembers(projectId);
      await loadInitialData();
    } catch (err) {
      alert("Error removing member: " + err.message);
    }
    return;
  }

  // Task Comments Open
  const commentsBtn = e.target.closest(".task-comments-btn");
  if (commentsBtn) {
    const taskId = Number(commentsBtn.dataset.id);
    const task = tasks.find(function (t) {
      return t.id === taskId;
    });

    if (task) {
      activeCommentsTaskId = taskId;
      document.getElementById("taskCommentTaskId").value = taskId;
      document.getElementById("taskCommentsTitle").textContent = task.title;

      const metaEl = document.getElementById("taskCommentsMeta");
      if (metaEl) {
        metaEl.innerHTML =
          '<span class="badge" style="background:#e2e8f0; color:#334155;">' + escapeHtml(task.projectName || getProjectName(task.projectId)) + '</span>' +
          '<span class="badge ' + task.priority + '">' + task.priority + '</span>' +
          '<span class="badge ' + statusClass(task.status) + '">' + formatStatus(task.status) + '</span>' +
          (task.assigned_to_name ? '<span class="muted" style="font-size:12px;">Assigned to: ' + escapeHtml(task.assigned_to_name) + '</span>' : '');
      }

      const descEl = document.getElementById("taskCommentsDescWrap");
      if (descEl) {
        descEl.textContent = task.description ? task.description : "No description provided.";
      }

      const feedbackEl = document.getElementById("taskCommentFeedback");
      if (feedbackEl) {
        feedbackEl.textContent = "";
        feedbackEl.style.color = "";
      }
      const commentInput = document.getElementById("taskCommentInput");
      if (commentInput) commentInput.value = "";

      openModal("taskCommentsModal");
      loadTaskComments(taskId);
    }
    return;
  }

  // Task Delete
  const deleteTaskBtn = e.target.closest(".delete-task-btn");
  if (deleteTaskBtn) {
    const taskId = Number(deleteTaskBtn.dataset.id);
    const task = tasks.find(function (t) {
      return t.id === taskId;
    });

    const taskTitle = task ? task.title : "this task";
    if (!confirm('Are you sure you want to delete task "' + taskTitle + '"?')) {
      return;
    }

    const token = getToken();
    if (!token) {
      logout();
      return;
    }

    try {
      deleteTaskBtn.disabled = true;
      deleteTaskBtn.textContent = "Deleting...";

      const response = await fetch(API_BASE + "/api/tasks/" + taskId, {
        method: "DELETE",
        headers: {
          Authorization: "Bearer " + token,
        },
      });

      if (response.status === 401) {
        logout();
        return;
      }

      if (!response.ok) {
        const errData = await response.json().catch(function () { return {}; });
        throw new Error(errData.error || "Failed to delete task");
      }

      await loadInitialData();
    } catch (err) {
      alert("Error deleting task: " + err.message);
    } finally {
      deleteTaskBtn.disabled = false;
      deleteTaskBtn.textContent = "Delete";
    }
    return;
  }
});

// Settings Form Listener
const settingsForm = document.getElementById("settingsForm");
if (settingsForm) {
  settingsForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const token = getToken();
    const noteEl = document.getElementById("settingsNote");
    const submitBtn = settingsForm.querySelector("button[type='submit']");
    const nameInput = document.getElementById("settingsName");
    const roleInput = document.getElementById("settingsRole");

    if (!token) {
      if (noteEl) noteEl.textContent = "Authentication required. Please log in.";
      return;
    }

    const name = nameInput ? nameInput.value.trim() : "";
    if (!name) {
      if (noteEl) noteEl.textContent = "Name is required.";
      return;
    }
    if (name.length > 100) {
      if (noteEl) noteEl.textContent = "Name cannot exceed 100 characters.";
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";
    }
    if (noteEl) noteEl.textContent = "";

    try {
      const response = await fetch(API_BASE + "/api/auth/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ name: name }),
      });

      const data = await response.json().catch(function () {
        return {};
      });

      if (!response.ok) {
        throw new Error(data.error || "Failed to update profile.");
      }

      // Update cached user with authoritative server response
      const currentUser = getUser() || {};
      const updatedUser = Object.assign({}, currentUser, data);
      localStorage.setItem("user", JSON.stringify(updatedUser));

      // Update profile, header and avatar UI
      updateHeaderUser(updatedUser);

      // Preserve local role input display without fabricating a database role
      if (roleInput && roleInput.value.trim()) {
        const roleEl = document.getElementById("profileRole");
        if (roleEl) roleEl.textContent = roleInput.value.trim();
      }

      if (noteEl) noteEl.textContent = "Profile updated.";
    } catch (err) {
      if (noteEl) noteEl.textContent = err.message || "Failed to update profile.";
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Save Profile";
      }
    }
  });
}

// Phase 4A: Member Management Logic
let activeMembersProjectId = null;

async function loadProjectMembers(projectId) {
  const token = getToken();
  if (!token) {
    logout();
    return;
  }

  const tableBody = document.getElementById("membersTableBody");
  if (!tableBody) return;
  tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:16px;">Loading members...</td></tr>';

  try {
    const response = await fetch(API_BASE + "/api/projects/" + projectId + "/members", {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    if (response.status === 401) {
      logout();
      return;
    }

    if (!response.ok) {
      const err = await response.json().catch(function () { return {}; });
      tableBody.innerHTML = '<tr><td colspan="4" class="empty" style="color:var(--danger);">' + escapeHtml(err.error || "Failed to load members") + '</td></tr>';
      return;
    }

    const members = await response.json();
    if (!Array.isArray(members) || members.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="4" class="empty">No members found.</td></tr>';
      return;
    }

    // Determine current user's role in this project to enable/disable controls
    const curUser = getUser();
    const curUserId = curUser ? Number(curUser.id) : null;
    const isOwner = members.some(function (m) {
      return m.is_owner && Number(m.id) === curUserId;
    });
    const isAdmin = members.some(function (m) {
      return !m.is_owner && Number(m.id) === curUserId && m.role === "admin";
    });
    const canManage = isOwner || isAdmin;

    // Show or hide Add Member form based on permissions
    const addMemberForm = document.getElementById("addMemberForm");
    if (addMemberForm) {
      addMemberForm.style.display = canManage ? "block" : "none";
    }

    tableBody.innerHTML = members.map(function (m) {
      const isOwnerRow = Boolean(m.is_owner);
      const isSelf = Number(m.id) === curUserId;

      let roleDisplay = "";
      if (isOwnerRow) {
        roleDisplay = '<span class="role-badge role-owner">Owner</span>';
      } else if (canManage) {
        roleDisplay =
          '<select class="member-role-select" data-user-id="' + m.id + '">' +
          '<option value="member"' + (m.role === "member" ? " selected" : "") + '>Member</option>' +
          '<option value="admin"' + (m.role === "admin" ? " selected" : "") + '>Admin</option>' +
          '<option value="viewer"' + (m.role === "viewer" ? " selected" : "") + '>Viewer</option>' +
          '</select>';
      } else {
        const badgeClass = "role-" + escapeHtml(m.role || "member");
        roleDisplay = '<span class="role-badge ' + badgeClass + '">' + escapeHtml(m.role || "member") + '</span>';
      }

      let actionsDisplay = "";
      if (isOwnerRow) {
        actionsDisplay = '<span class="muted" style="font-size:12px;">Primary Owner</span>';
      } else if (canManage || isSelf) {
        const btnLabel = isSelf ? "Leave" : "Remove";
        actionsDisplay =
          '<button class="btn btn-sm btn-danger remove-member-btn" data-user-id="' + m.id + '" data-name="' + escapeHtml(m.name) + '">' +
          btnLabel +
          '</button>';
      } else {
        actionsDisplay = '<span class="muted" style="font-size:12px;">-</span>';
      }

      return (
        '<tr>' +
        '<td><strong>' + escapeHtml(m.name) + '</strong>' + (isSelf ? ' <small class="muted">(You)</small>' : '') + '</td>' +
        '<td>' + escapeHtml(m.email) + '</td>' +
        '<td>' + roleDisplay + '</td>' +
        '<td>' + actionsDisplay + '</td>' +
        '</tr>'
      );
    }).join("");
  } catch (err) {
    tableBody.innerHTML = '<tr><td colspan="4" class="empty" style="color:var(--danger);">' + escapeHtml(err.message || "Network error loading members") + '</td></tr>';
  }
}

// Add Member Form Submission
const addMemberFormEl = document.getElementById("addMemberForm");
if (addMemberFormEl) {
  addMemberFormEl.addEventListener("submit", async function (e) {
    e.preventDefault();

    const submitBtn = document.getElementById("addMemberSubmitBtn");
    const feedbackEl = document.getElementById("memberAddFeedback");
    const emailInput = document.getElementById("memberEmail");
    const roleSelect = document.getElementById("memberRole");
    const idInput = document.getElementById("memberProjectId");
    const projectId = activeMembersProjectId || (idInput ? Number(idInput.value) : 0);

    if (!projectId) return;

    const email = emailInput.value.trim();
    const role = roleSelect.value;

    if (!email) {
      feedbackEl.style.color = "var(--danger)";
      feedbackEl.textContent = "Please enter an email address.";
      return;
    }

    const token = getToken();
    if (!token) {
      logout();
      return;
    }

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Adding...";
      }
      feedbackEl.textContent = "";

      const res = await fetch(API_BASE + "/api/projects/" + projectId + "/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ email: email, role: role }),
      });

      if (res.status === 401) {
        logout();
        return;
      }

      const data = await res.json().catch(function () { return {}; });

      if (!res.ok) {
        throw new Error(data.error || "Failed to add member");
      }

      feedbackEl.style.color = "var(--success)";
      feedbackEl.textContent = "Member added successfully!";
      emailInput.value = "";

      await loadProjectMembers(projectId);
      await loadInitialData();
    } catch (err) {
      feedbackEl.style.color = "var(--danger)";
      feedbackEl.textContent = err.message;
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Add Member";
      }
    }
  });
}

// Member Role Change Delegation
document.addEventListener("change", async function (e) {
  const roleSelect = e.target.closest(".member-role-select");
  if (roleSelect) {
    const userId = Number(roleSelect.dataset.userId);
    const newRole = roleSelect.value;
    const projectId = activeMembersProjectId;

    if (!projectId || !userId) return;

    const token = getToken();
    if (!token) {
      logout();
      return;
    }

    try {
      roleSelect.disabled = true;
      const res = await fetch(API_BASE + "/api/projects/" + projectId + "/members/" + userId, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (res.status === 401) {
        logout();
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(function () { return {}; });
        throw new Error(err.error || "Failed to update role");
      }

      await loadProjectMembers(projectId);
    } catch (err) {
      alert("Error updating member role: " + err.message);
      await loadProjectMembers(projectId);
    } finally {
      roleSelect.disabled = false;
    }
  }
});

// Phase 4B: Task Comments Logic
let activeCommentsTaskId = null;

function formatCommentDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function loadTaskComments(taskId) {
  const token = getToken();
  if (!token) {
    logout();
    return;
  }

  const listEl = document.getElementById("taskCommentsList");
  if (!listEl) return;
  listEl.innerHTML = '<p class="empty">Loading comments...</p>';

  try {
    const res = await fetch(API_BASE + "/api/tasks/" + taskId + "/comments", {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    if (res.status === 401) {
      logout();
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(function () { return {}; });
      listEl.innerHTML = '<p class="empty" style="color:var(--danger);">' + escapeHtml(err.error || "Failed to load comments") + '</p>';
      return;
    }

    const comments = await res.json();
    if (!Array.isArray(comments) || comments.length === 0) {
      listEl.innerHTML = '<p class="empty">No comments yet. Start the conversation!</p>';
      return;
    }

    const curUser = getUser();
    const curUserId = curUser ? Number(curUser.id) : null;

    listEl.innerHTML = comments.map(function (c) {
      const isSelf = Number(c.user_id) === curUserId;
      const parts = (c.user_name || "User").split(" ");
      const initials = ((parts[0] ? parts[0][0] : "") + (parts[1] ? parts[1][0] : "")).toUpperCase() || "U";
      const formattedTime = formatCommentDate(c.created_at);

      return (
        '<div class="comment-card">' +
        '<div class="comment-header">' +
        '<div class="comment-author-wrap">' +
        '<div class="comment-avatar">' + escapeHtml(initials) + '</div>' +
        '<span class="comment-author-name">' + escapeHtml(c.user_name || "User") + (isSelf ? ' <small class="muted">(You)</small>' : '') + '</span>' +
        '</div>' +
        '<span class="comment-time">' + escapeHtml(formattedTime) + '</span>' +
        '</div>' +
        '<div class="comment-body">' + escapeHtml(c.comment) + '</div>' +
        '</div>'
      );
    }).join("");

    listEl.scrollTop = listEl.scrollHeight;
  } catch (err) {
    listEl.innerHTML = '<p class="empty" style="color:var(--danger);">' + escapeHtml(err.message || "Error loading comments") + '</p>';
  }
}

// Add Task Comment Form Submission
const addTaskCommentFormEl = document.getElementById("addTaskCommentForm");
if (addTaskCommentFormEl) {
  addTaskCommentFormEl.addEventListener("submit", async function (e) {
    e.preventDefault();

    const submitBtn = document.getElementById("addCommentSubmitBtn");
    const feedbackEl = document.getElementById("taskCommentFeedback");
    const commentInput = document.getElementById("taskCommentInput");
    const taskId = activeCommentsTaskId;

    if (!taskId) return;

    const commentText = commentInput.value.trim();
    if (!commentText) {
      if (feedbackEl) {
        feedbackEl.style.color = "var(--danger)";
        feedbackEl.textContent = "Please enter a comment.";
      }
      return;
    }

    const token = getToken();
    if (!token) {
      logout();
      return;
    }

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Posting...";
      }
      if (feedbackEl) {
        feedbackEl.textContent = "";
      }

      const res = await fetch(API_BASE + "/api/tasks/" + taskId + "/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ comment: commentText }),
      });

      if (res.status === 401) {
        logout();
        return;
      }

      const data = await res.json().catch(function () { return {}; });

      if (!res.ok) {
        throw new Error(data.error || "Failed to post comment");
      }

      commentInput.value = "";
      if (feedbackEl) {
        feedbackEl.style.color = "var(--success)";
        feedbackEl.textContent = "Comment posted!";
        setTimeout(function () {
          if (feedbackEl) feedbackEl.textContent = "";
        }, 2000);
      }

      await loadTaskComments(taskId);
      await loadTasks();
    } catch (err) {
      if (feedbackEl) {
        feedbackEl.style.color = "var(--danger)";
        feedbackEl.textContent = err.message;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Post Comment";
      }
    }
  });
}

function mapProject(item) {
  const dueDate = item.due_date || item.due || "";
  return {
    id: item.id,
    name: item.name,
    description: item.description || "",
    status: item.status || "active",
    due: dueDate ? String(dueDate).slice(0, 10) : "",
    owner_id: item.owner_id,
    owner_name: item.owner_name,
    member_count: item.member_count !== undefined ? Number(item.member_count) : 1,
  };
}

function mapTask(item) {
  const dueDate = item.due_date || item.due || "";
  const pId = Number(item.project_id || item.projectId);
  return {
    id: item.id,
    title: item.title,
    projectId: pId,
    projectName: item.project_name || getProjectName(pId),
    due: dueDate ? String(dueDate).slice(0, 10) : "",
    priority: formatPriority(item.priority),
    status: toCanonicalStatus(item.status),
    description: item.description || "",
    assigned_to: item.assigned_to,
    assigned_to_name: item.assigned_to_name || "",
    comment_count: item.comment_count !== undefined ? Number(item.comment_count) : 0,
  };
}

function showProjectsMessage(message) {
  const html = '<p class="empty">' + message + "</p>";
  dashboardProjects.innerHTML = html;
  projectsGrid.innerHTML = html;
}

function loadProjects() {
  const token = getToken();
  if (!token) {
    logout();
    return Promise.reject(new Error("No token"));
  }

  showProjectsMessage("Loading projects...");

  return fetch(API_BASE + "/api/projects", {
    headers: {
      Authorization: "Bearer " + token,
    },
  })
    .then(function (response) {
      if (response.status === 401) {
        logout();
        throw new Error("Session expired. Please log in again.");
      }
      if (!response.ok) {
        throw new Error("Could not load projects");
      }
      return response.json();
    })
    .then(function (data) {
      const list = Array.isArray(data) ? data : [];
      projects = list.map(mapProject);
      renderAll();
      return projects;
    })
    .catch(function (err) {
      projects = [];
      showProjectsMessage(
        err.message || "Could not load projects. Start the backend and try again."
      );
      renderStats();
      renderTasks();
      fillProjectSelect();
    });
}

function loadTasks() {
  const token = getToken();
  if (!token) return Promise.resolve([]);

  return fetch(API_BASE + "/api/tasks", {
    headers: {
      Authorization: "Bearer " + token,
    },
  })
    .then(function (response) {
      if (response.status === 401) {
        logout();
        throw new Error("Session expired. Please log in again.");
      }
      if (!response.ok) {
        throw new Error("Could not load tasks");
      }
      return response.json();
    })
    .then(function (data) {
      const list = Array.isArray(data) ? data : [];
      tasks = list.map(mapTask);
      renderAll();
      return tasks;
    })
    .catch(function (err) {
      console.error("Error loading tasks:", err);
      tasks = [];
      renderAll();
    });
}

async function loadInitialData() {
  syncCurrentUser();
  await loadProjects();
  await loadTasks();
}

loadInitialData();
