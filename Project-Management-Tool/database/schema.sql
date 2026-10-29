CREATE DATABASE IF NOT EXISTS project_management
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE project_management;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS projects (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  owner_id INT UNSIGNED NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  due_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_projects_owner_id (owner_id),
  KEY idx_projects_status (status),
  CONSTRAINT fk_projects_owner
    FOREIGN KEY (owner_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_members (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'member',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_project_members (project_id, user_id),
  KEY idx_project_members_user_id (user_id),
  CONSTRAINT fk_project_members_project
    FOREIGN KEY (project_id) REFERENCES projects (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_project_members_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  assigned_to INT UNSIGNED NULL,
  due_date DATE NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  status VARCHAR(30) NOT NULL DEFAULT 'todo',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tasks_project_id (project_id),
  KEY idx_tasks_assigned_to (assigned_to),
  KEY idx_tasks_status (status),
  KEY idx_tasks_due_date (due_date),
  CONSTRAINT fk_tasks_project
    FOREIGN KEY (project_id) REFERENCES projects (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_tasks_assigned_to
    FOREIGN KEY (assigned_to) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_comments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_task_comments_task_id (task_id),
  KEY idx_task_comments_user_id (user_id),
  CONSTRAINT fk_task_comments_task
    FOREIGN KEY (task_id) REFERENCES tasks (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_task_comments_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
