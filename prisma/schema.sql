-- =====================================================================
-- MLH Judging Platform — Complete PostgreSQL Schema
-- Compatible with Neon DB (PostgreSQL 14+)
-- Generated from Prisma schema
-- =====================================================================

-- Enums
CREATE TYPE "Role" AS ENUM ('ADMIN', 'JUDGE', 'TEAM');
CREATE TYPE "EventStatus" AS ENUM ('SETUP', 'JUDGING', 'COMPLETED');
CREATE TYPE "SetStatus" AS ENUM ('UNASSIGNED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE "ProjectStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'IN_JUDGING', 'JUDGING_COMPLETE', 'FLAGGED', 'SCORED');
CREATE TYPE "FlagStatus" AS ENUM ('OPEN', 'REVIEWED', 'DISMISSED');
CREATE TYPE "RejudgeStatus" AS ENUM ('PENDING', 'COMPLETED');

-- =====================================================================
-- Tables
-- =====================================================================

CREATE TABLE "users" (
    "id"            TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name"          TEXT NOT NULL,
    "email"         TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role"          "Role" NOT NULL,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "events" (
    "id"               TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name"             TEXT NOT NULL,
    "description"      TEXT,
    "start_date"       TIMESTAMP(3),
    "end_date"         TIMESTAMP(3),
    "time_per_project" INTEGER NOT NULL DEFAULT 180,
    "set_size"         INTEGER NOT NULL DEFAULT 5,
    "status"           "EventStatus" NOT NULL DEFAULT 'SETUP',
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tracks" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid(),
    "event_id"    TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "color"       TEXT NOT NULL DEFAULT '#3B82F6',
    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tracks_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "projects" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "event_id"     TEXT NOT NULL,
    "team_id"      TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "description"  TEXT,
    "demo_link"    TEXT,
    "video_url"    TEXT,
    "room_number"  TEXT,
    "team_number"  TEXT,
    "leader_name"  TEXT,
    "status"       "ProjectStatus" NOT NULL DEFAULT 'SUBMITTED',
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "projects_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "projects_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "judge_sets" (
    "id"         TEXT NOT NULL DEFAULT gen_random_uuid(),
    "event_id"   TEXT NOT NULL,
    "judge_id"   TEXT,
    "column"     INTEGER NOT NULL,
    "set_number" INTEGER NOT NULL,
    "status"     "SetStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "judge_sets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "judge_sets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "judge_sets_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "judge_set_projects" (
    "id"         TEXT NOT NULL DEFAULT gen_random_uuid(),
    "set_id"     TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    CONSTRAINT "judge_set_projects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "judge_set_projects_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "judge_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "judge_set_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "judge_set_projects_set_id_project_id_key" ON "judge_set_projects"("set_id", "project_id");

CREATE TABLE "scores" (
    "id"                 TEXT NOT NULL DEFAULT gen_random_uuid(),
    "set_id"             TEXT NOT NULL,
    "project_id"         TEXT NOT NULL,
    "judge_id"           TEXT NOT NULL,
    "completion"         INTEGER NOT NULL,
    "originality"        INTEGER NOT NULL,
    "learning"           INTEGER NOT NULL,
    "design"             INTEGER NOT NULL,
    "technology"         INTEGER NOT NULL,
    "total"              INTEGER NOT NULL,
    "time_spent_seconds" INTEGER NOT NULL DEFAULT 0,
    "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scores_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "scores_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "judge_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scores_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "scores_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "scores_set_id_project_id_judge_id_key" ON "scores"("set_id", "project_id", "judge_id");

CREATE TABLE "feedbacks" (
    "id"         TEXT NOT NULL DEFAULT gen_random_uuid(),
    "set_id"     TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "judge_id"   TEXT NOT NULL,
    "comment"    TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "feedbacks_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "judge_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "feedbacks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "feedbacks_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "track_nominations" (
    "id"         TEXT NOT NULL DEFAULT gen_random_uuid(),
    "set_id"     TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "judge_id"   TEXT NOT NULL,
    "track_id"   TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "track_nominations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "track_nominations_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "judge_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "track_nominations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "track_nominations_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "track_nominations_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "track_nominations_set_id_project_id_judge_id_track_id_key" ON "track_nominations"("set_id", "project_id", "judge_id", "track_id");

CREATE TABLE "stack_rank_votes" (
    "id"         TEXT NOT NULL DEFAULT gen_random_uuid(),
    "set_id"     TEXT NOT NULL,
    "judge_id"   TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "rank"       INTEGER NOT NULL,
    "points"     INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stack_rank_votes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stack_rank_votes_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "judge_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stack_rank_votes_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stack_rank_votes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "stack_rank_votes_set_id_judge_id_rank_key" ON "stack_rank_votes"("set_id", "judge_id", "rank");

CREATE TABLE "rejudge_assignments" (
    "id"               TEXT NOT NULL DEFAULT gen_random_uuid(),
    "event_id"         TEXT NOT NULL,
    "judge_id"         TEXT NOT NULL,
    "tied_project_ids" TEXT NOT NULL,
    "status"           "RejudgeStatus" NOT NULL DEFAULT 'PENDING',
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rejudge_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rejudge_assignments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rejudge_assignments_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "flags" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid(),
    "event_id"    TEXT NOT NULL,
    "project_id"  TEXT NOT NULL,
    "flagged_by"  TEXT NOT NULL,
    "reason"      TEXT NOT NULL,
    "status"      "FlagStatus" NOT NULL DEFAULT 'OPEN',
    "admin_notes" TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "flags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "flags_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "flags_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "flags_flagged_by_fkey" FOREIGN KEY ("flagged_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "audit_logs" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id"     TEXT NOT NULL,
    "action"      TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id"   TEXT NOT NULL,
    "details"     TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
