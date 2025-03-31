/*
  # Database Schema for Wake-up Bot

  1. Tables
    - users: Stores user information and wake-up settings
    - groups: Stores group information and streak records
    - group_users: Links users to groups

  2. Security
    - Enable RLS on all tables
    - Add service role policies for full access
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

-- Create policies if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'users' 
    AND policyname = 'Service role can do anything on users'
  ) THEN
    CREATE POLICY "Service role can do anything on users"
    ON users FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'groups' 
    AND policyname = 'Service role can do anything on groups'
  ) THEN
    CREATE POLICY "Service role can do anything on groups"
    ON groups FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'group_users' 
    AND policyname = 'Service role can do anything on group_users'
  ) THEN
    CREATE POLICY "Service role can do anything on group_users"
    ON group_users FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;