/*
  # Create tables for wakeup-kun bot

  1. New Tables
    - `users`
      - `id` (text, primary key) - LINE user ID
      - `name` (text) - LINE display name
      - `wakeup_time_hours` (integer) - Wake up time hours
      - `wakeup_time_minutes` (integer) - Wake up time minutes
      - `last_report` (timestamptz) - Last wake up report time
      - `today_reported` (boolean) - Whether reported today
      - `joker_used` (boolean) - Whether used joker today
      - `last_joker_date` (timestamptz) - Last joker use date
      - `week_joker_count` (integer) - Weekly joker use count
      - `week_start_date` (date) - Current week start date
      - `created_at` (timestamptz) - Record creation time

    - `groups`
      - `id` (text, primary key) - LINE group ID
      - `current_streak` (integer) - Current consecutive success days
      - `best_streak` (integer) - Best consecutive success days
      - `created_at` (timestamptz) - Record creation time

    - `group_users`
      - `group_id` (text, references groups) - LINE group ID
      - `user_id` (text, references users) - LINE user ID
      - `created_at` (timestamptz) - Record creation time

  2. Security
    - Enable RLS on all tables
    - Add policies for service role access
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  name text NOT NULL,
  wakeup_time_hours integer,
  wakeup_time_minutes integer,
  last_report timestamptz,
  today_reported boolean DEFAULT false,
  joker_used boolean DEFAULT false,
  last_joker_date timestamptz,
  week_joker_count integer DEFAULT 0,
  week_start_date date,
  created_at timestamptz DEFAULT now()
);

-- Create groups table
CREATE TABLE IF NOT EXISTS groups (
  id text PRIMARY KEY,
  current_streak integer DEFAULT 0,
  best_streak integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create group_users table
CREATE TABLE IF NOT EXISTS group_users (
  group_id text REFERENCES groups(id),
  user_id text REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_users ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Service role can do anything on users"
ON users FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can do anything on groups"
ON groups FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can do anything on group_users"
ON group_users FOR ALL TO service_role
USING (true)
WITH CHECK (true);