require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "codealpha_dev_secret_fallback_key";

pool.query("SELECT 1")
  .then(() => console.log("MySQL connected successfully"))
  .catch((err) => console.error("MySQL connection failed:", err.message));

app.use(express.json());
app.use(
  cors({
    origin: true,
  })
);

// Serve static frontend files from ../frontend
const frontendPath = path.join(__dirname, "../frontend");
app.use(express.static(frontendPath));

// Root route explicitly serves frontend/index.html
app.get("/", function (req, res) {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ error: "Access denied. Authentication token required." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, name, email }
    if (req.user && req.user.id !== undefined) {
      req.user.id = Number(req.user.id);
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

// -------------------------------------------------------------
// Helpers for Project, Membership & Task Authorization
// -------------------------------------------------------------

// Checks whether a project exists and whether the user has read/manage access
async function checkProjectAccess(projectId, userId) {
  const pId = Number(projectId);
  const uId = Number(userId);

  if (!pId || isNaN(pId) || pId <= 0 || !uId || isNaN(uId) || uId <= 0) {
    return {
      exists: false,
      hasAccess: false,
      isOwner: false,
      isMember: false,
      role: null,
      canModifyTasks: false,
    };
  }

  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.owner_id,
            pm.role AS member_role
     FROM projects p
     LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
     WHERE p.id = ?`,
    [uId, pId]
  );

  if (rows.length === 0) {
    return {
      exists: false,
      hasAccess: false,
      isOwner: false,
      isMember: false,
      role: null,
      canModifyTasks: false,
    };
  }

  const isOwner = Number(rows[0].owner_id) === uId;
  const isMember = rows[0].member_role !== null && rows[0].member_role !== undefined;
  const rawRole = isOwner
    ? "owner"
    : rows[0].member_role
    ? String(rows[0].member_role).toLowerCase()
    : null;
  const canModifyTasks = isOwner || (isMember && rawRole !== "viewer");

  return {
    exists: true,
    hasAccess: isOwner || isMember,
    isOwner,
    isMember,
    role: rawRole,
    canModifyTasks,
    project: rows[0],
  };
}

// Checks if user can manage members (must be project owner or have admin/lead role in project_members)
async function canManageMembers(projectId, userId) {
  const pId = Number(projectId);
  const uId = Number(userId);

  if (!pId || isNaN(pId) || pId <= 0 || !uId || isNaN(uId) || uId <= 0) {
    return { exists: false, canManage: false, isOwner: false };
  }

  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.owner_id
     FROM projects p
     WHERE p.id = ?`,
    [pId]
  );

  if (rows.length === 0) {
    return { exists: false, canManage: false, isOwner: false };
  }

  const isOwner = Number(rows[0].owner_id) === uId;
  if (isOwner) {
    return { exists: true, canManage: true, isOwner: true, project: rows[0] };
  }

  const [members] = await pool.query(
    `SELECT role FROM project_members WHERE project_id = ? AND user_id = ?`,
    [pId, uId]
  );

  const canManage =
    members.length > 0 &&
    ["admin", "lead", "owner"].includes(String(members[0].role).toLowerCase());

  return {
    exists: true,
    canManage,
    isOwner: false,
    project: rows[0],
    memberRole: members.length > 0 ? members[0].role : null,
  };
}

// Validates that an assigned user is legitimately the project owner or a project member
async function isValidAssignee(projectId, assigneeId) {
  if (!assigneeId) return true;
  const [rows] = await pool.query(
    `SELECT 1 FROM projects WHERE id = ? AND owner_id = ?
     UNION
     SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?`,
    [projectId, assigneeId, projectId, assigneeId]
  );
  return rows.length > 0;
}

// -------------------------------------------------------------
// Public API Endpoints
// -------------------------------------------------------------

app.get("/api/health", function (req, res) {
  res.json({
    status: "ok",
    message: "Project Management API is running",
  });
});

// POST /api/auth/register
app.post("/api/auth/register", async function (req, res, next) {
  try {
    const { name, email, password } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }
    const trimmedName = name.trim();
    if (trimmedName.length > 100) {
      return res
        .status(400)
        .json({ error: "Name cannot exceed 100 characters" });
    }

    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ error: "Email is required" });
    }
    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail) || trimmedEmail.length > 255) {
      return res
        .status(400)
        .json({ error: "A valid email address is required" });
    }

    if (!password || typeof password !== "string") {
      return res.status(400).json({ error: "Password is required" });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters long" });
    }

    // Check for duplicate email registration
    const [existingUsers] = await pool.query(
      "SELECT id FROM users WHERE email = ?",
      [trimmedEmail]
    );

    if (existingUsers.length > 0) {
      return res
        .status(409)
        .json({ error: "An account with this email already exists" });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const [insertResult] = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      [trimmedName, trimmedEmail, passwordHash]
    );

    const userId = insertResult.insertId;

    const token = jwt.sign(
      { id: userId, name: trimmedName, email: trimmedEmail },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.status(201).json({
      message: "User registered successfully",
      token: token,
      user: {
        id: userId,
        name: trimmedName,
        email: trimmedEmail,
      },
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ error: "An account with this email already exists" });
    }
    next(err);
  }
});

// POST /api/auth/login
app.post("/api/auth/login", async function (req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== "string" || !email.trim() || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required" });
    }

    const trimmedEmail = email.trim().toLowerCase();

    const [rows] = await pool.query(
      "SELECT id, name, email, password_hash FROM users WHERE email = ?",
      [trimmedEmail]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      message: "Login successful",
      token: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// Protected User Endpoints
// -------------------------------------------------------------

// GET /api/auth/me
app.get("/api/auth/me", authenticateToken, async function (req, res, next) {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, email, created_at FROM users WHERE id = ?",
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/me
app.put("/api/auth/me", authenticateToken, async function (req, res, next) {
  try {
    const { name } = req.body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 100) {
      return res
        .status(400)
        .json({ error: "Name cannot exceed 100 characters" });
    }

    const [userRows] = await pool.query(
      "SELECT id FROM users WHERE id = ?",
      [req.user.id]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await pool.query(
      "UPDATE users SET name = ? WHERE id = ?",
      [trimmedName, req.user.id]
    );

    const [rows] = await pool.query(
      "SELECT id, name, email, created_at FROM users WHERE id = ?",
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Error updating user profile:", err.message);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// -------------------------------------------------------------
// Protected Project Endpoints
// -------------------------------------------------------------

// GET /api/projects - lists projects belonging to or shared with authenticated user
app.get("/api/projects", authenticateToken, async function (req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.description, p.status, p.due_date,
              p.owner_id, p.created_at, p.updated_at,
              u.name AS owner_name,
              (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) + 1 AS member_count
       FROM projects p
       JOIN users u ON p.owner_id = u.id
       WHERE p.owner_id = ?
          OR EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = p.id AND pm.user_id = ?
          )
       ORDER BY p.created_at DESC`,
      [req.user.id, req.user.id]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:id - single project with ownership/membership permission check
app.get("/api/projects/:id", authenticateToken, async function (req, res, next) {
  try {
    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.description, p.status, p.due_date,
              p.owner_id, p.created_at, p.updated_at,
              u.name AS owner_name,
              (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) + 1 AS member_count
       FROM projects p
       JOIN users u ON p.owner_id = u.id
       WHERE p.id = ?`,
      [projectId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const project = rows[0];

    // Check if user is owner or member
    if (project.owner_id !== req.user.id) {
      const [members] = await pool.query(
        "SELECT id FROM project_members WHERE project_id = ? AND user_id = ?",
        [projectId, req.user.id]
      );

      if (members.length === 0) {
        return res
          .status(403)
          .json({ error: "Access denied: you do not have permission to view this project" });
      }
    }

    res.json(project);
  } catch (err) {
    next(err);
  }
});

// POST /api/projects - associates project strictly with req.user.id
app.post("/api/projects", authenticateToken, async function (req, res, next) {
  try {
    const { name, description, due_date, status } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Project name is required" });
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 150) {
      return res
        .status(400)
        .json({ error: "Project name cannot exceed 150 characters" });
    }

    let dueDateVal = null;
    if (due_date) {
      if (
        typeof due_date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(due_date.trim())
      ) {
        return res
          .status(400)
          .json({ error: "Due date must be in YYYY-MM-DD format" });
      }
      const parsed = new Date(due_date.trim());
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ error: "Invalid due date" });
      }
      dueDateVal = due_date.trim();
    }

    const allowedStatuses = ["active", "in-progress", "completed", "on-hold", "archived"];
    const statusVal =
      status && allowedStatuses.includes(String(status).trim().toLowerCase())
        ? String(status).trim().toLowerCase()
        : "active";

    const descVal =
      description && typeof description === "string"
        ? description.trim()
        : null;

    // Project owner is strictly the authenticated user
    const ownerId = req.user.id;

    const [insertResult] = await pool.query(
      `INSERT INTO projects (name, description, owner_id, status, due_date)
       VALUES (?, ?, ?, ?, ?)`,
      [trimmedName, descVal, ownerId, statusVal, dueDateVal]
    );

    const [createdRows] = await pool.query(
      `SELECT p.id, p.name, p.description, p.status, p.due_date,
              p.owner_id, p.created_at, p.updated_at,
              u.name AS owner_name,
              1 AS member_count
       FROM projects p
       JOIN users u ON p.owner_id = u.id
       WHERE p.id = ?`,
      [insertResult.insertId]
    );

    res.status(201).json(createdRows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/projects/:id - updates an existing project
app.put("/api/projects/:id", authenticateToken, async function (req, res, next) {
  try {
    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    const [existing] = await pool.query(
      "SELECT id, name, description, owner_id, status, due_date FROM projects WHERE id = ?",
      [projectId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const project = existing[0];

    // Authorization check: owner or authorized project member
    let isAuthorized = project.owner_id === req.user.id;
    if (!isAuthorized) {
      const [members] = await pool.query(
        "SELECT role FROM project_members WHERE project_id = ? AND user_id = ?",
        [projectId, req.user.id]
      );
      if (
        members.length > 0 &&
        ["admin", "owner", "lead"].includes(members[0].role.toLowerCase())
      ) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res
        .status(403)
        .json({ error: "Access denied: you do not have permission to update this project" });
    }

    const { name, description, due_date, status } = req.body;

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Project name cannot be empty" });
      }
      if (name.trim().length > 150) {
        return res
          .status(400)
          .json({ error: "Project name cannot exceed 150 characters" });
      }
    }

    let dueDateVal = project.due_date;
    if (due_date !== undefined) {
      if (due_date === null || due_date === "") {
        dueDateVal = null;
      } else {
        if (
          typeof due_date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(due_date.trim())
        ) {
          return res
            .status(400)
            .json({ error: "Due date must be in YYYY-MM-DD format" });
        }
        const parsed = new Date(due_date.trim());
        if (isNaN(parsed.getTime())) {
          return res.status(400).json({ error: "Invalid due date" });
        }
        dueDateVal = due_date.trim();
      }
    }

    const allowedStatuses = ["active", "in-progress", "completed", "on-hold", "archived"];
    let statusVal = project.status;
    if (status !== undefined) {
      if (
        typeof status !== "string" ||
        !allowedStatuses.includes(status.trim().toLowerCase())
      ) {
        return res.status(400).json({
          error: "Status must be one of: " + allowedStatuses.join(", "),
        });
      }
      statusVal = status.trim().toLowerCase();
    }

    const nameVal = name !== undefined ? name.trim() : project.name;
    const descVal =
      description !== undefined
        ? (typeof description === "string" ? description.trim() : null)
        : project.description;

    await pool.query(
      `UPDATE projects
       SET name = ?, description = ?, status = ?, due_date = ?
       WHERE id = ?`,
      [nameVal, descVal, statusVal, dueDateVal, projectId]
    );

    const [updatedRows] = await pool.query(
      `SELECT p.id, p.name, p.description, p.status, p.due_date,
              p.owner_id, p.created_at, p.updated_at,
              u.name AS owner_name,
              (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) + 1 AS member_count
       FROM projects p
       JOIN users u ON p.owner_id = u.id
       WHERE p.id = ?`,
      [projectId]
    );

    res.json(updatedRows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/projects/:id - deletes a project
app.delete("/api/projects/:id", authenticateToken, async function (req, res, next) {
  try {
    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    const [existing] = await pool.query(
      "SELECT id, name, owner_id FROM projects WHERE id = ?",
      [projectId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const project = existing[0];

    // Authorization check: only the owner can delete the project
    if (project.owner_id !== req.user.id) {
      return res.status(403).json({
        error: "Access denied: only the project owner can delete this project",
      });
    }

    await pool.query("DELETE FROM projects WHERE id = ?", [projectId]);

    res.json({
      message: "Project deleted successfully",
      id: projectId,
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// Protected Project Membership Endpoints
// -------------------------------------------------------------

// GET /api/projects/:projectId/members - lists all members of a project (owner + members)
app.get("/api/projects/:projectId/members", authenticateToken, async function (req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    const access = await checkProjectAccess(projectId, req.user.id);
    if (!access.exists) {
      return res.status(404).json({ error: "Project not found" });
    }
    if (!access.hasAccess) {
      return res.status(403).json({
        error: "Access denied: you do not have permission to view members of this project",
      });
    }

    // Returns the project owner unioned with all project members
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, 'owner' AS role, p.created_at, true AS is_owner
       FROM projects p
       JOIN users u ON p.owner_id = u.id
       WHERE p.id = ?
       UNION
       SELECT u.id, u.name, u.email, pm.role, pm.created_at, false AS is_owner
       FROM project_members pm
       JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = ?
       ORDER BY is_owner DESC, role ASC, name ASC`,
      [projectId, projectId]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:projectId/members - adds an existing user to project by email
app.post("/api/projects/:projectId/members", authenticateToken, async function (req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    const management = await canManageMembers(projectId, req.user.id);
    if (!management.exists) {
      return res.status(404).json({ error: "Project not found" });
    }
    if (!management.canManage) {
      return res.status(403).json({
        error: "Access denied: only project owners or administrators can add members",
      });
    }

    const { email, role } = req.body;

    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ error: "User email is required" });
    }
    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({ error: "A valid email address is required" });
    }

    const allowedRoles = ["member", "admin", "viewer"];
    let roleVal = "member";
    if (role !== undefined && role !== null && role !== "") {
      const r = String(role).trim().toLowerCase();
      if (!allowedRoles.includes(r)) {
        return res.status(400).json({
          error: "Role must be one of: " + allowedRoles.join(", "),
        });
      }
      roleVal = r;
    }

    // Lookup user by email
    const [userRows] = await pool.query(
      "SELECT id, name, email FROM users WHERE email = ?",
      [trimmedEmail]
    );

    if (userRows.length === 0) {
      return res.status(404).json({
        error: "User with this email does not exist",
      });
    }

    const targetUser = userRows[0];

    // Cannot add the project owner as a member
    if (targetUser.id === management.project.owner_id) {
      return res.status(409).json({
        error: "User is already the owner of this project",
      });
    }

    // Check if already a member
    const [existingMember] = await pool.query(
      "SELECT id FROM project_members WHERE project_id = ? AND user_id = ?",
      [projectId, targetUser.id]
    );

    if (existingMember.length > 0) {
      return res.status(409).json({
        error: "User is already a member of this project",
      });
    }

    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)",
      [projectId, targetUser.id, roleVal]
    );

    res.status(201).json({
      message: "Member added successfully",
      member: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        role: roleVal,
        is_owner: false,
        project_id: projectId,
      },
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "User is already a member of this project" });
    }
    next(err);
  }
});

// PUT /api/projects/:projectId/members/:userId - updates a member's role
app.put("/api/projects/:projectId/members/:userId", authenticateToken, async function (req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    const targetUserId = Number(req.params.userId);

    if (!projectId || isNaN(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Invalid project ID" });
    }
    if (!targetUserId || isNaN(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const management = await canManageMembers(projectId, req.user.id);
    if (!management.exists) {
      return res.status(404).json({ error: "Project not found" });
    }
    if (!management.canManage) {
      return res.status(403).json({
        error: "Access denied: only project owners or administrators can change member roles",
      });
    }

    if (targetUserId === management.project.owner_id) {
      return res.status(400).json({
        error: "Cannot change the role of the project owner",
      });
    }

    const { role } = req.body;
    if (!role || typeof role !== "string") {
      return res.status(400).json({ error: "Role is required" });
    }
    const r = role.trim().toLowerCase();
    const allowedRoles = ["member", "admin", "viewer"];
    if (!allowedRoles.includes(r)) {
      return res.status(400).json({
        error: "Role must be one of: " + allowedRoles.join(", "),
      });
    }

    const [existingMember] = await pool.query(
      "SELECT id FROM project_members WHERE project_id = ? AND user_id = ?",
      [projectId, targetUserId]
    );

    if (existingMember.length === 0) {
      return res.status(404).json({ error: "Member not found in this project" });
    }

    await pool.query(
      "UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?",
      [r, projectId, targetUserId]
    );

    const [memberRows] = await pool.query(
      `SELECT u.id, u.name, u.email, pm.role, pm.updated_at, false AS is_owner
       FROM project_members pm
       JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = ? AND pm.user_id = ?`,
      [projectId, targetUserId]
    );

    res.json({
      message: "Member role updated successfully",
      member: memberRows[0],
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/projects/:projectId/members/:userId - removes a member from a project
app.delete("/api/projects/:projectId/members/:userId", authenticateToken, async function (req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    const targetUserId = Number(req.params.userId);

    if (!projectId || isNaN(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Invalid project ID" });
    }
    if (!targetUserId || isNaN(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const management = await canManageMembers(projectId, req.user.id);
    if (!management.exists) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (targetUserId === management.project.owner_id) {
      return res.status(400).json({
        error: "Cannot remove the project owner from the project",
      });
    }

    const isSelfRemoval = req.user.id === targetUserId;
    if (!management.canManage && !isSelfRemoval) {
      return res.status(403).json({
        error: "Access denied: only project owners or administrators can remove members",
      });
    }

    const [existingMember] = await pool.query(
      "SELECT id FROM project_members WHERE project_id = ? AND user_id = ?",
      [projectId, targetUserId]
    );

    if (existingMember.length === 0) {
      return res.status(404).json({ error: "Member not found in this project" });
    }

    await pool.query(
      "DELETE FROM project_members WHERE project_id = ? AND user_id = ?",
      [projectId, targetUserId]
    );

    res.json({
      message: "Member removed from project successfully",
      project_id: projectId,
      user_id: targetUserId,
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// Protected Task Endpoints
// -------------------------------------------------------------

// GET /api/tasks - lists all tasks across projects accessible to authenticated user
app.get("/api/tasks", authenticateToken, async function (req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.project_id, t.title, t.description, t.assigned_to,
              t.due_date, t.priority, t.status, t.created_at, t.updated_at,
              p.name AS project_name,
              u.name AS assigned_to_name,
              (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) AS comment_count
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE p.owner_id = ?
          OR EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = p.id AND pm.user_id = ?
          )
       ORDER BY t.created_at DESC`,
      [req.user.id, req.user.id]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:projectId/tasks - lists all tasks for a specific project
app.get("/api/projects/:projectId/tasks", authenticateToken, async function (req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    const access = await checkProjectAccess(projectId, req.user.id);
    if (!access.exists) {
      return res.status(404).json({ error: "Project not found" });
    }
    if (!access.hasAccess) {
      return res.status(403).json({
        error: "Access denied: you do not have permission to view tasks in this project",
      });
    }

    const [rows] = await pool.query(
      `SELECT t.id, t.project_id, t.title, t.description, t.assigned_to,
              t.due_date, t.priority, t.status, t.created_at, t.updated_at,
              p.name AS project_name,
              u.name AS assigned_to_name,
              (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) AS comment_count
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.project_id = ?
       ORDER BY t.created_at DESC`,
      [projectId]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:projectId/tasks - creates a task in a specific project
app.post("/api/projects/:projectId/tasks", authenticateToken, async function (req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    const access = await checkProjectAccess(projectId, req.user.id);
    if (!access.exists) {
      return res.status(404).json({ error: "Project not found" });
    }
    if (!access.hasAccess) {
      return res.status(403).json({
        error: "Access denied: you do not have permission to create tasks in this project",
      });
    }
    if (!access.canModifyTasks) {
      return res.status(403).json({
        error: "Access denied: viewers do not have permission to create tasks in this project",
      });
    }

    const { title, description, assigned_to, due_date, priority, status } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Task title is required" });
    }
    const trimmedTitle = title.trim();
    if (trimmedTitle.length > 200) {
      return res.status(400).json({ error: "Task title cannot exceed 200 characters" });
    }

    let dueDateVal = null;
    if (due_date) {
      if (typeof due_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(due_date.trim())) {
        return res.status(400).json({ error: "Due date must be in YYYY-MM-DD format" });
      }
      const parsed = new Date(due_date.trim());
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ error: "Invalid due date" });
      }
      dueDateVal = due_date.trim();
    }

    const allowedPriorities = ["low", "medium", "high"];
    let priorityVal = "medium";
    if (priority) {
      const p = String(priority).trim().toLowerCase();
      if (!allowedPriorities.includes(p)) {
        return res.status(400).json({
          error: "Priority must be one of: " + allowedPriorities.join(", "),
        });
      }
      priorityVal = p;
    }

    const allowedStatuses = ["todo", "to do", "in progress", "in-progress", "done"];
    let statusVal = "todo";
    if (status) {
      const s = String(status).trim().toLowerCase();
      if (!allowedStatuses.includes(s)) {
        return res.status(400).json({
          error: "Status must be one of: todo, in progress, done",
        });
      }
      statusVal = (s === "in progress" || s === "in-progress") ? "in-progress" : (s === "done" ? "done" : "todo");
    }

    let assignedToVal = null;
    if (assigned_to !== undefined && assigned_to !== null && assigned_to !== "") {
      const assigneeId = Number(assigned_to);
      if (isNaN(assigneeId) || assigneeId <= 0) {
        return res.status(400).json({ error: "Invalid assigned_to user ID" });
      }
      const valid = await isValidAssignee(projectId, assigneeId);
      if (!valid) {
        return res.status(400).json({
          error: "Assigned user must be the project owner or a project member",
        });
      }
      assignedToVal = assigneeId;
    }

    const descVal = description && typeof description === "string" ? description.trim() : null;

    const [insertResult] = await pool.query(
      `INSERT INTO tasks (project_id, title, description, assigned_to, due_date, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [projectId, trimmedTitle, descVal, assignedToVal, dueDateVal, priorityVal, statusVal]
    );

    const [createdRows] = await pool.query(
      `SELECT t.id, t.project_id, t.title, t.description, t.assigned_to,
              t.due_date, t.priority, t.status, t.created_at, t.updated_at,
              p.name AS project_name,
              u.name AS assigned_to_name
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.id = ?`,
      [insertResult.insertId]
    );

    res.status(201).json(createdRows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/tasks/:id - single task details
app.get("/api/tasks/:id", authenticateToken, async function (req, res, next) {
  try {
    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "Invalid task ID" });
    }

    const [rows] = await pool.query(
      `SELECT t.id, t.project_id, t.title, t.description, t.assigned_to,
              t.due_date, t.priority, t.status, t.created_at, t.updated_at,
              p.name AS project_name, p.owner_id AS project_owner_id,
              u.name AS assigned_to_name,
              (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) AS comment_count
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.id = ?`,
      [taskId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    const task = rows[0];

    const access = await checkProjectAccess(task.project_id, req.user.id);
    if (!access.hasAccess) {
      return res.status(403).json({
        error: "Access denied: you do not have permission to view this task",
      });
    }

    res.json(task);
  } catch (err) {
    next(err);
  }
});

// PUT /api/tasks/:id - updates an existing task
app.put("/api/tasks/:id", authenticateToken, async function (req, res, next) {
  try {
    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "Invalid task ID" });
    }

    const [existing] = await pool.query(
      `SELECT t.id, t.project_id, t.title, t.description, t.assigned_to,
              t.due_date, t.priority, t.status
       FROM tasks t
       WHERE t.id = ?`,
      [taskId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    const task = existing[0];

    const access = await checkProjectAccess(task.project_id, req.user.id);
    if (!access.hasAccess) {
      return res.status(403).json({
        error: "Access denied: you do not have permission to update tasks in this project",
      });
    }
    if (!access.canModifyTasks) {
      return res.status(403).json({
        error: "Access denied: viewers do not have permission to update tasks in this project",
      });
    }

    const { title, description, assigned_to, due_date, priority, status } = req.body;

    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "Task title cannot be empty" });
      }
      if (title.trim().length > 200) {
        return res.status(400).json({ error: "Task title cannot exceed 200 characters" });
      }
    }

    let dueDateVal = task.due_date;
    if (due_date !== undefined) {
      if (due_date === null || due_date === "") {
        dueDateVal = null;
      } else {
        if (typeof due_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(due_date.trim())) {
          return res.status(400).json({ error: "Due date must be in YYYY-MM-DD format" });
        }
        const parsed = new Date(due_date.trim());
        if (isNaN(parsed.getTime())) {
          return res.status(400).json({ error: "Invalid due date" });
        }
        dueDateVal = due_date.trim();
      }
    }

    const allowedPriorities = ["low", "medium", "high"];
    let priorityVal = task.priority;
    if (priority !== undefined) {
      const p = String(priority).trim().toLowerCase();
      if (!allowedPriorities.includes(p)) {
        return res.status(400).json({
          error: "Priority must be one of: " + allowedPriorities.join(", "),
        });
      }
      priorityVal = p;
    }

    const allowedStatuses = ["todo", "to do", "in progress", "in-progress", "done"];
    let statusVal = task.status;
    if (status !== undefined) {
      const s = String(status).trim().toLowerCase();
      if (!allowedStatuses.includes(s)) {
        return res.status(400).json({
          error: "Status must be one of: todo, in progress, done",
        });
      }
      statusVal = (s === "in progress" || s === "in-progress") ? "in-progress" : (s === "done" ? "done" : "todo");
    }

    let assignedToVal = task.assigned_to;
    if (assigned_to !== undefined) {
      if (assigned_to === null || assigned_to === "") {
        assignedToVal = null;
      } else {
        const assigneeId = Number(assigned_to);
        if (isNaN(assigneeId) || assigneeId <= 0) {
          return res.status(400).json({ error: "Invalid assigned_to user ID" });
        }
        const valid = await isValidAssignee(task.project_id, assigneeId);
        if (!valid) {
          return res.status(400).json({
            error: "Assigned user must be the project owner or a project member",
          });
        }
        assignedToVal = assigneeId;
      }
    }

    const titleVal = title !== undefined ? title.trim() : task.title;
    const descVal =
      description !== undefined
        ? (typeof description === "string" ? description.trim() : null)
        : task.description;

    await pool.query(
      `UPDATE tasks
       SET title = ?, description = ?, assigned_to = ?, due_date = ?, priority = ?, status = ?
       WHERE id = ?`,
      [titleVal, descVal, assignedToVal, dueDateVal, priorityVal, statusVal, taskId]
    );

    const [updatedRows] = await pool.query(
      `SELECT t.id, t.project_id, t.title, t.description, t.assigned_to,
              t.due_date, t.priority, t.status, t.created_at, t.updated_at,
              p.name AS project_name,
              u.name AS assigned_to_name
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.id = ?`,
      [taskId]
    );

    res.json(updatedRows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tasks/:id - deletes an existing task
app.delete("/api/tasks/:id", authenticateToken, async function (req, res, next) {
  try {
    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "Invalid task ID" });
    }

    const [existing] = await pool.query(
      `SELECT t.id, t.project_id, t.title FROM tasks t WHERE t.id = ?`,
      [taskId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    const task = existing[0];

    const access = await checkProjectAccess(task.project_id, req.user.id);
    if (!access.hasAccess) {
      return res.status(403).json({
        error: "Access denied: you do not have permission to delete tasks in this project",
      });
    }
    if (!access.canModifyTasks) {
      return res.status(403).json({
        error: "Access denied: viewers do not have permission to delete tasks in this project",
      });
    }

    await pool.query("DELETE FROM tasks WHERE id = ?", [taskId]);

    res.json({
      message: "Task deleted successfully",
      id: taskId,
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// Protected Task Comments Endpoints (Phase 4B)
// -------------------------------------------------------------

// GET /api/tasks/:id/comments - lists all comments for a task
app.get("/api/tasks/:id/comments", authenticateToken, async function (req, res, next) {
  try {
    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "Invalid task ID" });
    }

    const [taskRows] = await pool.query(
      "SELECT id, project_id, title FROM tasks WHERE id = ?",
      [taskId]
    );

    if (taskRows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    const task = taskRows[0];
    const access = await checkProjectAccess(task.project_id, req.user.id);
    if (!access.exists) {
      return res.status(404).json({ error: "Project not found" });
    }
    if (!access.hasAccess) {
      return res.status(403).json({
        error: "Access denied: you do not have permission to view comments for this task",
      });
    }

    const [comments] = await pool.query(
      `SELECT c.id, c.task_id, c.user_id, c.comment, c.created_at, c.updated_at,
              u.name AS user_name, u.email AS user_email
       FROM task_comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.task_id = ?
       ORDER BY c.created_at ASC`,
      [taskId]
    );

    res.json(comments);
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks/:id/comments - adds a comment to a task
app.post("/api/tasks/:id/comments", authenticateToken, async function (req, res, next) {
  try {
    const taskId = Number(req.params.id);
    if (!taskId || isNaN(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "Invalid task ID" });
    }

    const [taskRows] = await pool.query(
      "SELECT id, project_id, title FROM tasks WHERE id = ?",
      [taskId]
    );

    if (taskRows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    const task = taskRows[0];
    const access = await checkProjectAccess(task.project_id, req.user.id);
    if (!access.exists) {
      return res.status(404).json({ error: "Project not found" });
    }
    if (!access.hasAccess) {
      return res.status(403).json({
        error: "Access denied: you do not have permission to add comments to this task",
      });
    }

    const { comment } = req.body;
    if (!comment || typeof comment !== "string" || !comment.trim()) {
      return res.status(400).json({ error: "Comment text cannot be empty" });
    }

    const trimmed = comment.trim();
    if (trimmed.length > 2000) {
      return res.status(400).json({ error: "Comment cannot exceed 2000 characters" });
    }

    const [insertResult] = await pool.query(
      "INSERT INTO task_comments (task_id, user_id, comment) VALUES (?, ?, ?)",
      [taskId, req.user.id, trimmed]
    );

    const [created] = await pool.query(
      `SELECT c.id, c.task_id, c.user_id, c.comment, c.created_at, c.updated_at,
              u.name AS user_name, u.email AS user_email
       FROM task_comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.id = ?`,
      [insertResult.insertId]
    );

    res.status(201).json(created[0]);
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// Error Handlers
// -------------------------------------------------------------

// Unknown routes: return JSON 404
app.use(function (req, res) {
  res.status(404).json({
    error: "Not found",
    path: req.originalUrl,
  });
});

app.use(function (err, req, res, next) {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

const server = app.listen(PORT, function () {
  console.log("Server running on port " + PORT);
});

server.on("error", function (err) {
  console.error("Server failed to start:", err.message);
  process.exit(1);
});

process.on("unhandledRejection", function (reason) {
  console.error("Unhandled promise rejection:", reason);
});
