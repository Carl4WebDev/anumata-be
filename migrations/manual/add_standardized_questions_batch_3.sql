-- 48 more standardized questions in 12 more topics, 4 each (batch 3). Safe to run more than once:
-- questions whose code already exists are skipped.
-- All are 'draft_pending_review' until a licensed professional reviews them.

INSERT INTO standardized_questions (question_code, text, category, version, review_status, is_active, created_at, updated_at)
VALUES
  -- 1. Getting Started
  ('WRM_1', 'How are you feeling right now, as we begin?', 'Getting Started', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('WRM_2', 'What made you decide to seek support at this time?', 'Getting Started', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('WRM_3', 'Is there anything you would like your therapist to know about you before anything else?', 'Getting Started', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('WRM_4', 'What would help you feel more at ease while answering these questions?', 'Getting Started', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 2. Closing and Reflection
  ('CLS_1', 'How did it feel to answer these questions today?', 'Closing and Reflection', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('CLS_2', 'Is there anything you shared today that you would like your therapist to pay special attention to?', 'Closing and Reflection', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('CLS_3', 'Is there anything you were not ready to share today that you might want to talk about later?', 'Closing and Reflection', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('CLS_4', 'What is one thing you are looking forward to in the coming days?', 'Closing and Reflection', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 3. Romantic Relationships
  ('ROM_1', 'If you are in a romantic relationship, or were recently, how would you describe it?', 'Romantic Relationships', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('ROM_2', 'How are disagreements usually resolved in your relationship?', 'Romantic Relationships', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('ROM_3', 'Do you feel respected and supported by your partner? Please share as much as you are comfortable with.', 'Romantic Relationships', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('ROM_4', 'How has your relationship affected your emotional well-being lately?', 'Romantic Relationships', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 4. Caregiving and Responsibilities for Others
  ('CRG_1', 'Are you currently taking care of someone, such as a child, a parent, or another relative?', 'Caregiving and Responsibilities for Others', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('CRG_2', 'How do your caregiving responsibilities affect your energy and your time for yourself?', 'Caregiving and Responsibilities for Others', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('CRG_3', 'Who helps you when caring for others becomes too much?', 'Caregiving and Responsibilities for Others', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('CRG_4', 'What do you need most right now so you can care for others without neglecting yourself?', 'Caregiving and Responsibilities for Others', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 5. Distance and Separation from Loved Ones
  ('DST_1', 'Is anyone close to you living or working far away, such as abroad or in another city?', 'Distance and Separation from Loved Ones', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('DST_2', 'How does being apart from your loved ones affect you?', 'Distance and Separation from Loved Ones', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('DST_3', 'How do you stay connected with family members or friends who are far away?', 'Distance and Separation from Loved Ones', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('DST_4', 'Have changes in who lives at home affected your responsibilities or relationships?', 'Distance and Separation from Loved Ones', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 6. Peers, Bullying, and Social Pressure
  ('PER_1', 'How do you get along with your classmates, co-workers, or friends?', 'Peers, Bullying, and Social Pressure', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('PER_2', 'Have you felt pressured by others to do something you did not want to do?', 'Peers, Bullying, and Social Pressure', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('PER_3', 'Have you been teased, excluded, or treated unfairly by others? You may share only what you are comfortable sharing.', 'Peers, Bullying, and Social Pressure', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('PER_4', 'How do you usually respond when people around you disagree with your choices?', 'Peers, Bullying, and Social Pressure', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 7. Substances and Coping Habits
  ('HAB_1', 'How often do you drink alcohol, smoke, or vape, if at all? There are no right or wrong answers.', 'Substances and Coping Habits', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('HAB_2', 'Have you found yourself turning to substances, food, games, or other activities to cope with difficult feelings?', 'Substances and Coping Habits', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('HAB_3', 'Has anyone close to you expressed concern about any of your habits?', 'Substances and Coping Habits', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('HAB_4', 'Are there habits you would like to cut down on or change?', 'Substances and Coping Habits', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 8. Body, Health, and Self-Care
  ('BOD_1', 'How has your physical health been lately?', 'Body, Health, and Self-Care', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('BOD_2', 'How do you feel about your body and your appearance?', 'Body, Health, and Self-Care', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('BOD_3', 'Are there health conditions or medicines that affect how you feel from day to day?', 'Body, Health, and Self-Care', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('BOD_4', 'What do you do to take care of yourself physically?', 'Body, Health, and Self-Care', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 9. Identity and Acceptance
  ('IDN_1', 'What parts of who you are feel most important to you?', 'Identity and Acceptance', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('IDN_2', 'Do you feel accepted for who you are by the people around you?', 'Identity and Acceptance', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('IDN_3', 'Are there parts of yourself that you feel you need to hide from others?', 'Identity and Acceptance', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('IDN_4', 'Where or with whom do you feel most free to be yourself?', 'Identity and Acceptance', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 10. Difficult Past Experiences
  ('EXP_1', 'Have you gone through experiences in the past that still affect you today? You may share only what you feel ready to share.', 'Difficult Past Experiences', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('EXP_2', 'Are there memories that come back even when you do not want them to?', 'Difficult Past Experiences', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('EXP_3', 'Are there places, people, or situations that remind you of a difficult time?', 'Difficult Past Experiences', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('EXP_4', 'What has helped you feel safer or steadier after difficult experiences?', 'Difficult Past Experiences', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 11. Community and Major Events
  ('CMN_1', 'How have events in your community, such as disasters, accidents, or conflicts, affected you?', 'Community and Major Events', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('CMN_2', 'Do you feel safe in your neighborhood or community?', 'Community and Major Events', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('CMN_3', 'How connected do you feel to your community, church, or other groups?', 'Community and Major Events', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('CMN_4', 'How do you and the people around you support one another during hard times?', 'Community and Major Events', 1, 'draft_pending_review', true, NOW(), NOW()),

  -- 12. Hopes and Future Plans
  ('FUT_1', 'What are you hoping for in the coming year?', 'Hopes and Future Plans', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('FUT_2', 'What goals are important to you right now?', 'Hopes and Future Plans', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('FUT_3', 'What might get in the way of reaching your goals?', 'Hopes and Future Plans', 1, 'draft_pending_review', true, NOW(), NOW()),
  ('FUT_4', 'Who or what gives you hope when things feel uncertain?', 'Hopes and Future Plans', 1, 'draft_pending_review', true, NOW(), NOW())
ON CONFLICT (question_code) DO NOTHING;

-- Record it as applied, so `npm run migrate` won't run it again.
INSERT INTO pgmigrations (name, run_on)
SELECT '20261104130000_add_standardized_questions_batch_3', NOW()
WHERE to_regclass('public.pgmigrations') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM pgmigrations WHERE name = '20261104130000_add_standardized_questions_batch_3');
