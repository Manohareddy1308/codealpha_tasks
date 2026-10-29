# CodeAlpha Project Management Tool

A full-stack collaborative project management platform built for project tracking, task lifecycle management, team role-based access control, and task discussions.

Developed for the **CodeAlpha Web Development Internship**.

---

## Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture & Technology Stack](#system-architecture--technology-stack)
- [Project Directory Structure](#project-directory-structure)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Database Initialization](#database-initialization)
- [Installation & Running Locally](#installation--running-locally)
- [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
- [API Reference](#api-reference)
- [Testing & Verification](#testing--verification)
- [Known Limitations](#known-limitations)
- [License Information](#license-information)

---

## Overview

The **CodeAlpha Project Management Tool** provides a centralized system for organizing projects and tasks. Project owners can create projects, invite team members with specific roles, assign tasks with deadlines and priorities, monitor overall project completion, and engage in threaded discussions on individual tasks.

---

## Key Features

### 1. Authentication & Security
- **Registration & Login:** User accounts are secured using `bcryptjs` with 10 salt rounds. Plaintext passwords are never stored or returned in responses.
- **JWT Authorization:** Stateless sessions authenticated with JSON Web Tokens (`jsonwebtoken`), configured with a 24-hour expiration (`expiresIn: "24h"`).
- **Session Synchronization:** Listens to `window` storage events across browser tabs to keep authentication state synchronized.
- **Sanitization & Protection:** Frontend inputs are sanitized against XSS using an entity escaping function (`escapeHtml`). Backend queries use parameterized SQL statements to prevent SQL injection.

### 2. Project Lifecycle & Collaboration
- **Project CRUD:** Create, list, edit, and delete projects with name (up to 150 characters), description, status (`active`, `in-progress`, `completed`, `on-hold`, `archived`), and due date (`YYYY-MM-DD`).
- **Dynamic Progress Calculation:** Computes project completion percentages dynamically based on the proportion of tasks marked as `done`.
- **Member Invitations:** Project owners and administrators can add registered users by email with designated roles (`admin`, `member`, `viewer`).
- **Cascade Deletion:** Deleting a project automatically cascades to delete all associated project memberships, tasks, and task comments.

### 3. Task Management & Workflow Tracking
- **Task Metadata:** Track title (up to 200 characters), description, priority (`low`, `medium`, `high`), due date (`YYYY-MM-DD`), and workflow status (`todo`, `in-progress`, `done`).
- **Assignee Validation:** Tasks can only be assigned to valid users who are either the project owner or confirmed project members.
- **Enforced Viewer Restrictions:** Users with the `viewer` role can view projects, tasks, members, and comments, but are denied (`HTTP 403`) from creating, updating, or deleting tasks.

### 4. Interactive Dashboard & Search
- **KPI Summary Cards:** Real-time counters for Total Projects, Total Tasks, In Progress Tasks, and Completed Tasks.
- **Live Search Filter:** Client-side filtering matching search terms across project names, descriptions, task titles, priorities, and workflow statuses.

### 5. Task Discussions & Comments
- **Contextual Comment Threads:** Dedicated discussion feed on each task showing author name, initials avatar, and formatted timestamp.
- **Counter Badges:** Task tables display real-time comment counters for each task item.

---

## System Architecture & Technology Stack

### Backend
- **Runtime:** Node.js
- **Web Framework:** Express.js (`^5.3.0`)
- **Authentication:** `jsonwebtoken` (`^9.0.3`) and `bcryptjs` (`^3.0.3`)
- **Database Driver:** `mysql2` (`^3.24.6`) using promise-based queries and connection pooling
- **Environment Management:** `dotenv` (`^18.0.8`)
- **Cross-Origin Resource Sharing:** `cors` (`^2.8.6`)
- **Development Monitor:** `nodemon` (`^3.1.14`)

### Frontend
- **Interface:** Vanilla HTML5 and modern CSS3 (Custom Properties, Flexbox, CSS Grid)
- **Client Logic:** Modular vanilla JavaScript (ES6+) with the native Fetch API
- **Storage:** Browser `localStorage` for token and cached user session data

### Database
- **Database Engine:** MySQL (`InnoDB`, `utf8mb4_unicode_ci` charset)
- **Connection Pool Configuration:** Configured in `backend/db.js` with `connectionLimit: 10`, `waitForConnections: true`, and `queueLimit: 0`.

---

## Project Directory Structure

```text
Project Management/
├── backend/
│   ├── .env.example          # Environment variable template
│   ├── db.js                 # MySQL pool configuration (mysql2/promise)
│   ├── package.json          # Node dependencies and scripts
│   └── server.js             # Express application and API endpoints
├── database/
│   └── schema.sql            # MySQL database schema definition
├── frontend/
│   ├── index.html            # Main dashboard and workspace view
│   ├── login.html            # User authentication login view
│   ├── register.html         # User registration view
│   ├── script.js             # Frontend API client and UI controller
│   └── style.css             # Application stylesheet
├── .gitignore                # Excludes node_modules and .env files
└── Readme.md                 # Project documentation
```

---

## Prerequisites

Ensure you have the following installed on your system:
1. **Node.js:** v18.x or v20.x LTS recommended (`node -v`)
2. **npm:** Bundled with Node.js (`npm -v`)
3. **MySQL Server:** v8.0 or higher (`mysql --version`)

---

## Environment Configuration

1. In the `backend` directory, create a `.env` file based on `backend/.env.example`:
   - On Windows (PowerShell):
     ```powershell
     Copy-Item .\backend\.env.example .\backend\.env
     ```
   - On Linux / macOS:
     ```bash
     cp backend/.env.example backend/.env
     ```

2. Open `backend/.env` and fill in your local MySQL credentials and a secure JWT secret:
   ```env
   PORT=5000
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=your_mysql_user
   DB_PASSWORD=your_mysql_password
   DB_NAME=project_management
   JWT_SECRET=your_jwt_secret_key
   ```

> [!IMPORTANT]
> Keep your real `.env` file private. Do not commit `.env` to version control. Both `.env` and `backend/.env` are ignored by `.gitignore`.

---

## Database Initialization

The SQL schema file `database/schema.sql` creates the database `project_management` (if it does not exist) and sets up all five tables: `users`, `projects`, `project_members`, `tasks`, and `task_comments`.

### Option A: From the Project Root Directory (Command Line)
```bash
mysql -u your_mysql_user -p < database/schema.sql
```

### Option B: From Inside the `database` Directory
```bash
cd database
mysql -u your_mysql_user -p < schema.sql
```

### Option C: Using a Graphical Tool (MySQL Workbench / phpMyAdmin)
Open `database/schema.sql`, paste the script into your query editor, and execute it.

---

## Installation & Running Locally

1. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```

2. Start the Express server:
   ```bash
   npm start
   ```
   *(Alternatively, run `npx nodemon server.js` for auto-reloading during development.)*

3. Access the application in your browser:
   - Dashboard: `http://localhost:5000`
   - User Login: `http://localhost:5000/login.html`
   - Registration: `http://localhost:5000/register.html`

*The Express backend serves static frontend files from `../frontend`. If `index.html` is opened on a different local port (e.g., Live Server), `frontend/script.js` automatically directs API requests to port 5000.*

---

## Role-Based Access Control (RBAC)

Project permissions depend on whether the user is the project owner or an assigned member in `project_members`:

| Permission / Action | Owner | Admin | Member | Viewer |
| :--- | :---: | :---: | :---: | :---: |
| View project, tasks, and members | Yes | Yes | Yes | Yes |
| View and post task comments | Yes | Yes | Yes | Yes |
| Create, edit, and delete tasks | Yes | Yes | Yes | **No (HTTP 403)** |
| Invite members and update roles | Yes | Yes | No | No |
| Edit project details | Yes | Yes | No | No |
| Delete project | Yes (Exclusive) | No | No | No |

---

## API Reference

All protected endpoints require the HTTP header:  
`Authorization: Bearer <JWT_TOKEN>`

### Public Routes
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check endpoint returning `{ status: "ok" }` |
| `POST` | `/api/auth/register` | Register user (`name`, `email`, `password`) |
| `POST` | `/api/auth/login` | Authenticate user (`email`, `password`) |

### Protected User Route
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/auth/me` | Retrieve profile of the authenticated user |

### Protected Project Routes
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/projects` | List projects owned by or shared with the user |
| `GET` | `/api/projects/:id` | Get single project details |
| `POST` | `/api/projects` | Create a new project |
| `PUT` | `/api/projects/:id` | Update project metadata (Owner or Admin only) |
| `DELETE` | `/api/projects/:id` | Delete project (Owner only; cascades) |

### Protected Project Membership Routes
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/projects/:projectId/members` | List owner and all project members |
| `POST` | `/api/projects/:projectId/members` | Add member by email (`email`, `role: member\|admin\|viewer`) |
| `PUT` | `/api/projects/:projectId/members/:userId` | Update member role (Owner or Admin only) |
| `DELETE` | `/api/projects/:projectId/members/:userId` | Remove member (Admin/Owner) or self-leave |

### Protected Task Routes
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/tasks` | List all tasks accessible across user's projects |
| `GET` | `/api/projects/:projectId/tasks` | List tasks for a specific project |
| `POST` | `/api/projects/:projectId/tasks` | Create task in project (Owner, Admin, Member only) |
| `GET` | `/api/tasks/:id` | Get details of a single task |
| `PUT` | `/api/tasks/:id` | Update task details/status (Owner, Admin, Member only) |
| `DELETE` | `/api/tasks/:id` | Delete task (Owner, Admin, Member only) |

### Protected Task Comment Routes
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/tasks/:id/comments` | List all comments for a task in chronological order |
| `POST` | `/api/tasks/:id/comments` | Post a comment on a task (`comment` text) |

---

## Testing & Verification

### Static Syntax Check
To perform a static JavaScript syntax check without running the server or connecting to the database:
```bash
node -c backend/server.js
```
*(Note: `node -c` checks code syntax only; it does not execute automated unit or integration tests.)*

### Manual Multi-Role Verification Steps
To verify authorization boundaries safely:
1. Log in as **User A (Project Owner)** and create a test project and task.
2. In the project's **Members** modal, invite **User B** with the role set to `Viewer`.
3. In a separate private/incognito browser window, log in as **User B (Viewer)**.
4. Verify that **User B** can read the project, task list, and task comments.
5. Attempt to create, edit, or delete a task as **User B**; confirm the API responds with `HTTP 403 Forbidden` (`"Access denied: viewers do not have permission..."`).
6. Confirm that **User A (Owner)** and users with role `Member` can create, edit, and delete tasks normally.

---

## Known Limitations
- **Profile Settings Persistence:** Display name updates made in the Settings tab update `localStorage` and header DOM elements, but are not currently persisted to the MySQL database via a backend profile endpoint.
- **Automated Test Suite:** `backend/package.json` currently defines `"test": "echo \"Error: no test specified\" && exit 1"`. Automated testing with frameworks like Jest or Supertest has not yet been set up.

---

## License Information

The project configuration in `backend/package.json` specifies the **ISC** license. A separate `LICENSE` file is not currently included in the repository root.
