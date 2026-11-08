-- =====================================================================
-- شفرة الوعي الرقمي — Digital Awareness Quest
-- PostgreSQL schema. All timestamps are stored as timestamptz (UTC);
-- the UI presents and accepts them in Asia/Riyadh.
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('teacher','student');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE school_level AS ENUM ('intermediate','secondary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------- Users
CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role            user_role NOT NULL,
  username        text NOT NULL UNIQUE,          -- login id (teacher: email, student: internal code)
  password_hash   text NOT NULL,                 -- bcrypt, never plaintext
  full_name       text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  is_demo         boolean NOT NULL DEFAULT false, -- demo/dev data is flagged, never mixed silently
  token_version   int NOT NULL DEFAULT 0,          -- bump to invalidate sessions
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teacher_profiles (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  school_name  text
);

CREATE TABLE IF NOT EXISTS classes (
  id       serial PRIMARY KEY,
  level    school_level NOT NULL,
  grade    smallint NOT NULL CHECK (grade BETWEEN 1 AND 3),
  section  text NOT NULL,
  UNIQUE (level, grade, section)
);

-- Data minimisation: only what is needed for teaching (no national ID / phone / DOB).
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  student_code text NOT NULL UNIQUE,
  class_id     int NOT NULL REFERENCES classes(id),
  created_by   uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_student_class ON student_profiles(class_id);

-- --------------------------------------------------------------- Files
CREATE TABLE IF NOT EXISTS files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES users(id),
  original_name text NOT NULL,
  mime          text NOT NULL,
  size_bytes    bigint NOT NULL,
  storage_key   text NOT NULL UNIQUE,
  purpose       text NOT NULL CHECK (purpose IN ('lesson','cover','import')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------- Journey: stages/worlds
CREATE TABLE IF NOT EXISTS stages (
  id          smallint PRIMARY KEY CHECK (id BETWEEN 1 AND 7),
  slug        text NOT NULL UNIQUE,
  title       text NOT NULL,
  topic       text NOT NULL,
  summary     text NOT NULL,
  color       text NOT NULL,
  icon        text NOT NULL,
  badge_name  text NOT NULL,
  key_name    text NOT NULL,
  intro       jsonb NOT NULL      -- opening story: [{speaker, text}]
);

-- publish_state is what the teacher chooses; the *effective* status shown
-- (scheduled / open / ended) is computed from the dates on the server.
CREATE TABLE IF NOT EXISTS stage_schedules (
  stage_id        smallint PRIMARY KEY REFERENCES stages(id) ON DELETE CASCADE,
  publish_state   text NOT NULL DEFAULT 'draft' CHECK (publish_state IN ('draft','published','closed')),
  open_at         timestamptz,
  close_at        timestamptz,
  target_type     text NOT NULL DEFAULT 'all' CHECK (target_type IN ('all','level','grade','class','students')),
  target_level    school_level,
  target_grade    smallint,
  target_class_id int REFERENCES classes(id),
  pass_score      smallint NOT NULL DEFAULT 70 CHECK (pass_score BETWEEN 0 AND 100),
  max_attempts    smallint NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
  allow_retry     boolean NOT NULL DEFAULT true,
  require_previous boolean NOT NULL DEFAULT false,
  show_answers    text NOT NULL DEFAULT 'after_attempt' CHECK (show_answers IN ('after_attempt','after_close','never')),
  updated_by      uuid REFERENCES users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  open_notified_at timestamptz,
  closing_notified_at timestamptz,
  CHECK (close_at IS NULL OR open_at IS NULL OR close_at > open_at)
);

CREATE TABLE IF NOT EXISTS stage_target_students (
  stage_id   smallint REFERENCES stages(id) ON DELETE CASCADE,
  student_id uuid REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (stage_id, student_id)
);

-- Per-student exceptions granted by the teacher (individual access / extra attempts / extended deadline)
CREATE TABLE IF NOT EXISTS stage_exceptions (
  stage_id        smallint REFERENCES stages(id) ON DELETE CASCADE,
  student_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  grant_access    boolean NOT NULL DEFAULT false,
  extra_attempts  smallint NOT NULL DEFAULT 0,
  close_at_override timestamptz,
  reason          text,
  granted_by      uuid REFERENCES users(id),
  granted_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stage_id, student_id)
);

-- Steps of a stage: decision scenarios, mini-games and final-assessment questions.
-- `content` is safe to send to the client; `answer_key` never leaves the server.
CREATE TABLE IF NOT EXISTS scenarios (
  id          serial PRIMARY KEY,
  stage_id    smallint NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  position    smallint NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('scenario','minigame','quiz')),
  title       text NOT NULL,
  content     jsonb NOT NULL,
  answer_key  jsonb,
  max_points  smallint NOT NULL,
  mandatory   boolean NOT NULL DEFAULT true,
  UNIQUE (stage_id, position)
);

CREATE TABLE IF NOT EXISTS scenario_choices (
  id          serial PRIMARY KEY,
  scenario_id int NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  position    smallint NOT NULL,
  label       text NOT NULL,
  outcome     text NOT NULL,      -- consequence narrated after choosing
  points      smallint NOT NULL,
  is_best     boolean NOT NULL DEFAULT false,
  followup    jsonb,              -- optional branch: {prompt, options:[{label,outcome,points}]}
  UNIQUE (scenario_id, position)
);

CREATE TABLE IF NOT EXISTS stage_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id    smallint NOT NULL REFERENCES stages(id),
  student_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_no  smallint NOT NULL,
  status      text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','passed','failed','expired')),
  score_pct   numeric(5,2),
  points      int NOT NULL DEFAULT 0,
  max_points  int NOT NULL DEFAULT 0,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (stage_id, student_id, attempt_no)
);
-- only one open attempt per student per stage
CREATE UNIQUE INDEX IF NOT EXISTS uq_stage_attempt_open ON stage_attempts(stage_id, student_id) WHERE status = 'in_progress';

CREATE TABLE IF NOT EXISTS stage_responses (
  attempt_id  uuid NOT NULL REFERENCES stage_attempts(id) ON DELETE CASCADE,
  scenario_id int NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  choice_id   int REFERENCES scenario_choices(id),
  payload     jsonb,
  points      smallint NOT NULL,
  max_points  smallint NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, scenario_id)
);

CREATE TABLE IF NOT EXISTS stage_progress (
  stage_id        smallint NOT NULL REFERENCES stages(id),
  student_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','failed')),
  best_score      numeric(5,2),
  attempts_count  smallint NOT NULL DEFAULT 0,
  first_started_at timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  PRIMARY KEY (stage_id, student_id)
);

CREATE TABLE IF NOT EXISTS achievements (
  id          serial PRIMARY KEY,
  student_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('points','badge','key')),
  ref         text NOT NULL,          -- unique reference of the source (e.g. stage:3)
  title       text NOT NULL,
  points      int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, kind, ref)
);

-- ------------------------------------------------------------- Courses
CREATE TABLE IF NOT EXISTS courses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text NOT NULL,
  short_desc     text NOT NULL DEFAULT '',
  long_desc      text NOT NULL DEFAULT '',
  objectives     text[] NOT NULL DEFAULT '{}',
  skills         text[] NOT NULL DEFAULT '{}',
  cover_file_id  uuid REFERENCES files(id),
  instructor_name text NOT NULL,
  target_level   school_level,                 -- NULL = all levels
  target_grades  smallint[] NOT NULL DEFAULT '{}', -- empty = all grades
  level_label    text NOT NULL DEFAULT 'مبتدئ',
  duration_hours numeric(5,1) NOT NULL DEFAULT 1,
  enroll_start   timestamptz,
  enroll_end     timestamptz,
  content_start  timestamptz,
  course_end     timestamptz,
  pass_score     smallint NOT NULL DEFAULT 70 CHECK (pass_score BETWEEN 0 AND 100),
  max_attempts   smallint NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
  require_all_lessons boolean NOT NULL DEFAULT true,
  require_unit_tests  boolean NOT NULL DEFAULT false,
  require_final_pass  boolean NOT NULL DEFAULT true,
  publish_state  text NOT NULL DEFAULT 'draft' CHECK (publish_state IN ('draft','published','archived')),
  published_notified boolean NOT NULL DEFAULT false,
  created_by     uuid NOT NULL REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_modules (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title     text NOT NULL,
  position  int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_modules_course ON course_modules(course_id, position);

CREATE TABLE IF NOT EXISTS lessons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   uuid NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  title       text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('text','video','file','link','image','activity')),
  body        text NOT NULL DEFAULT '',
  url         text,
  file_id     uuid REFERENCES files(id),
  downloadable boolean NOT NULL DEFAULT true,
  is_mandatory boolean NOT NULL DEFAULT true,
  duration_min int NOT NULL DEFAULT 10,
  position    int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_lessons_module ON lessons(module_id, position);

CREATE TABLE IF NOT EXISTS course_enrollments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at  timestamptz NOT NULL DEFAULT now(),
  last_lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL,
  last_activity_at timestamptz,
  completed_at timestamptz,
  UNIQUE (course_id, student_id)            -- no duplicate enrolment
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  student_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id    uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, lesson_id)
);

-- ---------------------------------------------------- Questions & tests
CREATE TABLE IF NOT EXISTS questions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id   uuid REFERENCES course_modules(id) ON DELETE SET NULL,
  qtype       text NOT NULL CHECK (qtype IN ('mcq','tf','multi','match','order','short')),
  text        text NOT NULL,
  options     jsonb NOT NULL DEFAULT '[]',   -- public part
  answer      jsonb,                          -- answer key (server only)
  points      numeric(5,2) NOT NULL DEFAULT 1 CHECK (points > 0),
  explanation text NOT NULL DEFAULT '',
  difficulty  text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assessments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id     uuid REFERENCES course_modules(id) ON DELETE SET NULL,
  is_final      boolean NOT NULL DEFAULT false,
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',
  pass_score    smallint NOT NULL DEFAULT 70 CHECK (pass_score BETWEEN 0 AND 100),
  max_attempts  smallint NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
  time_limit_min int,                       -- NULL = untimed
  shuffle       boolean NOT NULL DEFAULT false,
  show_result   boolean NOT NULL DEFAULT true,
  show_answers  text NOT NULL DEFAULT 'after_submit' CHECK (show_answers IN ('after_submit','after_close','never')),
  open_at       timestamptz,
  close_at      timestamptz,
  is_published  boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_final_per_course ON assessments(course_id) WHERE is_final;

CREATE TABLE IF NOT EXISTS assessment_questions (
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id   uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  position      int NOT NULL DEFAULT 0,
  PRIMARY KEY (assessment_id, question_id)
);

CREATE TABLE IF NOT EXISTS assessment_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_no    smallint NOT NULL,
  status        text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','pending_review','graded')),
  question_order uuid[] NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  deadline_at   timestamptz,
  submitted_at  timestamptz,
  score         numeric(7,2),
  max_score     numeric(7,2),
  score_pct     numeric(5,2),
  passed        boolean,
  UNIQUE (assessment_id, student_id, attempt_no)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assessment_open ON assessment_attempts(assessment_id, student_id) WHERE status = 'in_progress';

CREATE TABLE IF NOT EXISTS assessment_answers (
  attempt_id   uuid NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  question_id  uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  response     jsonb,
  auto_points  numeric(5,2),
  manual_points numeric(5,2),
  needs_review boolean NOT NULL DEFAULT false,
  feedback     text,
  graded_by    uuid REFERENCES users(id),
  graded_at    timestamptz,
  PRIMARY KEY (attempt_id, question_id)
);

-- --------------------------------------------------------- Certificates
CREATE TABLE IF NOT EXISTS certificates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial       text NOT NULL UNIQUE,
  verify_token text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('stage','journey','course')),
  student_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage_id     smallint REFERENCES stages(id),
  course_id    uuid REFERENCES courses(id),
  title        text NOT NULL,             -- stage / course name frozen at issuance
  student_name text NOT NULL,             -- frozen at issuance
  instructor_name text,
  hours        numeric(5,1),
  score_pct    numeric(5,2),
  issued_at    timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','revoked')),
  revoked_at   timestamptz,
  revoked_by   uuid REFERENCES users(id),
  revoke_reason text
);
-- One certificate per achievement (revoked rows are kept, not deleted)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cert_stage   ON certificates(student_id, stage_id)  WHERE kind = 'stage';
CREATE UNIQUE INDEX IF NOT EXISTS uq_cert_course  ON certificates(student_id, course_id) WHERE kind = 'course';
CREATE UNIQUE INDEX IF NOT EXISTS uq_cert_journey ON certificates(student_id)            WHERE kind = 'journey';

-- -------------------------------------------------------- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  link       text,
  dedupe_key text,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);

-- ------------------------------------------------------------ Audit log
CREATE TABLE IF NOT EXISTS audit_logs (
  id         bigserial PRIMARY KEY,
  actor_id   uuid REFERENCES users(id),
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  details    jsonb NOT NULL DEFAULT '{}',
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
