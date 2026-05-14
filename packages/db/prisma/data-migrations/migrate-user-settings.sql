-- Data Migration Script: Migrate existing user settings to UserSettings table
-- Run this after the schema migration to preserve existing settings data

-- Step 1: Create UserSettings records for all existing users, copying their settings
INSERT INTO user_settings (
  id,
  user_id,
  include_stream_link_in_posts,
  auto_send_affiliate_links,
  context_prompt_dismissed,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  id,
  include_stream_link_in_posts,
  auto_send_affiliate_links,
  false, -- context_prompt_dismissed defaults to false
  NOW(),
  NOW()
FROM users
WHERE id NOT IN (SELECT user_id FROM user_settings);

-- Verify migration
SELECT 
  'Users without settings:' as check_type,
  COUNT(*) as count
FROM users u
LEFT JOIN user_settings s ON u.id = s.user_id
WHERE s.id IS NULL;

-- Note: The old columns on the users table will be kept for backward compatibility
-- during the transition period. They can be removed in a future migration after
-- verifying all services have been updated to use the user_settings table.
