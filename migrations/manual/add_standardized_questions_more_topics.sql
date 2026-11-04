-- 48 more standardized questions in 12 new topics (4 each). Safe to run more than once:
-- questions whose code already exists are skipped.
-- All are 'draft_pending_review' until a licensed professional reviews them.

INSERT INTO standardized_questions (question_code, text, category, version, review_status, is_active, created_at, updated_at)
VALUES
  -- 1. Thoughts and Self-Talk
  ('THK_1', 'What kinds of thoughts tend to come up when you are going through a hard time?', 'Thoughts and Self-Talk', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('THK_2', 'How do you usually talk to yourself when something does not go the way you hoped?', 'Thoughts and Self-Talk', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('THK_3', 'Are there thoughts that keep coming back even when you try to set them aside? You may share only what you are comfortable sharing.', 'Thoughts and Self-Talk', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('THK_4', 'What thoughts help you feel calmer or more hopeful?', 'Thoughts and Self-Talk', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 2. Self-Perception and Self-Worth
  ('SLF_1', 'How would you describe yourself to someone who does not know you yet?', 'Self-Perception and Self-Worth', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('SLF_2', 'What do you appreciate about yourself, even on difficult days?', 'Self-Perception and Self-Worth', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('SLF_3', 'Have recent experiences changed how you see yourself? If so, in what way?', 'Self-Perception and Self-Worth', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('SLF_4', 'When do you feel most confident or capable?', 'Self-Perception and Self-Worth', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 3. Worry and Nervousness
  ('WRY_1', 'What tends to make you feel worried or nervous?', 'Worry and Nervousness', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('WRY_2', 'How do you usually notice that worry is starting to build up?', 'Worry and Nervousness', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('WRY_3', 'What do you do when worrying thoughts become hard to set aside?', 'Worry and Nervousness', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('WRY_4', 'Are there situations you have started to avoid because they make you feel uneasy?', 'Worry and Nervousness', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 4. Mood and Outlook
  ('MOD_1', 'How would you describe your mood on a typical day recently?', 'Mood and Outlook', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('MOD_2', 'What moments in the past week brought you even a little enjoyment or relief?', 'Mood and Outlook', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('MOD_3', 'How do you feel when you think about the weeks or months ahead?', 'Mood and Outlook', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('MOD_4', 'Have you noticed losing interest in things you used to enjoy? Please describe what you have noticed.', 'Mood and Outlook', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 5. Anger and Frustration
  ('ANG_1', 'What situations have made you feel frustrated or irritated lately?', 'Anger and Frustration', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('ANG_2', 'How do you usually express anger or frustration?', 'Anger and Frustration', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('ANG_3', 'How do you feel after a moment of anger has passed?', 'Anger and Frustration', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('ANG_4', 'What helps you calm down when you feel upset with someone or something?', 'Anger and Frustration', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 6. Family and Home Life
  ('FAM_1', 'How would you describe the atmosphere at home lately?', 'Family and Home Life', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('FAM_2', 'What role do you usually take in your family when problems come up?', 'Family and Home Life', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('FAM_3', 'Are there family expectations that feel heavy for you right now?', 'Family and Home Life', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('FAM_4', 'Who in your family, if anyone, do you feel understands you?', 'Family and Home Life', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 7. School, Work, and Academic Pressure
  ('ACD_1', 'How are things going for you at school or work these days?', 'School, Work, and Academic Pressure', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('ACD_2', 'What part of your studies or work feels most demanding right now?', 'School, Work, and Academic Pressure', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('ACD_3', 'How do you handle deadlines, grades, or performance expectations?', 'School, Work, and Academic Pressure', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('ACD_4', 'How do your studies or work affect your rest and personal time?', 'School, Work, and Academic Pressure', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 8. Loneliness and Belonging
  ('BEL_1', 'How often do you feel lonely or left out, even when other people are around?', 'Loneliness and Belonging', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('BEL_2', 'Where or with whom do you feel you truly belong?', 'Loneliness and Belonging', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('BEL_3', 'What makes it easier or harder for you to connect with other people?', 'Loneliness and Belonging', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('BEL_4', 'How would you like your relationships with others to be different, if at all?', 'Loneliness and Belonging', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 9. Loss and Grief
  ('GRF_1', 'Have you experienced a loss recently, such as a loved one, a relationship, or an opportunity? You may share only what you feel ready to share.', 'Loss and Grief', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('GRF_2', 'How has this loss affected your daily life?', 'Loss and Grief', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('GRF_3', 'What has helped you carry this loss so far?', 'Loss and Grief', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('GRF_4', 'What do you miss most, and how do you keep that memory with you?', 'Loss and Grief', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 10. Money and Practical Stressors
  ('FIN_1', 'Have money matters or other practical concerns been weighing on you lately?', 'Money and Practical Stressors', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('FIN_2', 'How do financial or practical pressures affect your mood or relationships?', 'Money and Practical Stressors', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('FIN_3', 'What practical changes would make your day-to-day life feel lighter?', 'Money and Practical Stressors', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('FIN_4', 'Who, if anyone, helps you think through practical problems?', 'Money and Practical Stressors', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 11. Faith, Culture, and Meaning
  ('MNG_1', 'What gives your life a sense of meaning or purpose?', 'Faith, Culture, and Meaning', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('MNG_2', 'Does faith, spirituality, or your cultural background play a role in how you cope? If so, how?', 'Faith, Culture, and Meaning', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('MNG_3', 'Are there values or traditions that are important for your therapist to understand?', 'Faith, Culture, and Meaning', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('MNG_4', 'How do the people around you usually view seeking help for emotional concerns?', 'Faith, Culture, and Meaning', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 12. Online Life and Daily Habits
  ('DIG_1', 'How much of your day is spent online or on your phone, and how does that affect how you feel?', 'Online Life and Daily Habits', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('DIG_2', 'Have experiences online or on social media affected your mood or how you see yourself?', 'Online Life and Daily Habits', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('DIG_3', 'What daily habits help you feel well, and which ones make things harder?', 'Online Life and Daily Habits', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('DIG_4', 'How do you usually spend your free time when you want to relax?', 'Online Life and Daily Habits', 1, 'draft_pending_review', true, NOW(), NOW())
ON CONFLICT (question_code) DO NOTHING;

-- Record it as applied, so `npm run migrate` won't run it again.
INSERT INTO pgmigrations (name, run_on)
SELECT '20261104120000_add_standardized_questions_more_topics', NOW()
WHERE to_regclass('public.pgmigrations') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM pgmigrations WHERE name = '20261104120000_add_standardized_questions_more_topics');
