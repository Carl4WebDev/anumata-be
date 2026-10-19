export const shorthands = undefined;

export async function up(pgm) {
  pgm.sql(`
    INSERT INTO standardized_questions (question_code, text, category, version, review_status, is_active, created_at, updated_at)
    VALUES
      -- 1. Sleep, Rest, and Energy
      ('SLP_1', 'How would you describe your sleep over the past two weeks?', 'Sleep, Rest, and Energy', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('SLP_2', 'Have you noticed changes in your energy levels recently? Please describe them.', 'Sleep, Rest, and Energy', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('SLP_3', 'How rested do you usually feel when you wake up?', 'Sleep, Rest, and Energy', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('SLP_4', 'Have changes in your sleep or energy affected your daily activities?', 'Sleep, Rest, and Energy', 1, 'draft_pending_review', true, NOW(), NOW()),

      -- 2. Concentration and Daily Functioning
      ('CON_1', 'How has your ability to concentrate been recently?', 'Concentration and Daily Functioning', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('CON_2', 'Have you experienced any difficulties making decisions or completing tasks?', 'Concentration and Daily Functioning', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('CON_3', 'How have your emotional experiences affected your work, studies, or other responsibilities?', 'Concentration and Daily Functioning', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('CON_4', 'Which daily activities have felt easier or more difficult lately?', 'Concentration and Daily Functioning', 1, 'draft_pending_review', true, NOW(), NOW()),

      -- 3. Physical Well-Being and Stress Responses
      ('PHY_1', 'Have you noticed physical changes when you feel stressed or emotionally overwhelmed?', 'Physical Well-Being and Stress Responses', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('PHY_2', 'What do you usually notice in your body when you are under pressure?', 'Physical Well-Being and Stress Responses', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('PHY_3', 'How have your appetite or eating habits been recently?', 'Physical Well-Being and Stress Responses', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('PHY_4', 'What helps you feel physically comfortable and emotionally settled?', 'Physical Well-Being and Stress Responses', 1, 'draft_pending_review', true, NOW(), NOW()),

      -- 4. Major Life Changes and Current Stressors
      ('LIF_1', 'Have there been any significant changes in your life recently that you would like to discuss?', 'Major Life Changes and Current Stressors', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('LIF_2', 'What current situation has been taking up most of your emotional energy?', 'Major Life Changes and Current Stressors', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('LIF_3', 'How are your current responsibilities affecting your well-being?', 'Major Life Changes and Current Stressors', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('LIF_4', 'What part of your current situation feels most difficult to manage?', 'Major Life Changes and Current Stressors', 1, 'draft_pending_review', true, NOW(), NOW()),

      -- 5. Coping Resources and Personal Strengths
      ('COP_1', 'What personal strengths have helped you deal with difficult situations?', 'Coping Resources and Personal Strengths', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('COP_2', 'What activities or routines help you regain a sense of balance?', 'Coping Resources and Personal Strengths', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('COP_3', 'Can you recall a recent situation you handled better than you expected? What helped?', 'Coping Resources and Personal Strengths', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('COP_4', 'What would you like to do more often to support your well-being?', 'Coping Resources and Personal Strengths', 1, 'draft_pending_review', true, NOW(), NOW()),

      -- 6. Treatment Expectations and Support Preferences
      ('TRT_1', 'What would you most like to understand about your current emotional experiences?', 'Treatment Expectations and Support Preferences', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('TRT_2', 'What would make these sessions feel useful and supportive to you?', 'Treatment Expectations and Support Preferences', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('TRT_3', 'Are there topics you would prefer to discuss slowly or only when you feel ready?', 'Treatment Expectations and Support Preferences', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('TRT_4', 'What changes, if any, would you like to work toward with your therapist?', 'Treatment Expectations and Support Preferences', 1, 'draft_pending_review', true, NOW(), NOW()),

      -- 7. Previous Support and Relevant History
      ('HIS_1', 'Have you sought support for emotional or personal concerns before? You may share only what you feel comfortable sharing.', 'Previous Support and Relevant History', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('HIS_2', 'What was helpful or unhelpful about the support you received?', 'Previous Support and Relevant History', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('HIS_3', 'Is there anything about your personal history that you believe would help your therapist understand your current concerns?', 'Previous Support and Relevant History', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('HIS_4', 'Are there any previous strategies or sources of support you would like to revisit?', 'Previous Support and Relevant History', 1, 'draft_pending_review', true, NOW(), NOW()),

      -- 8. Safety, Comfort, and Session Preferences
      ('SAF_1', 'What helps you feel safe and comfortable when discussing personal experiences?', 'Safety, Comfort, and Session Preferences', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('SAF_2', 'Is there anything that would help you feel more in control of the pace of our conversation?', 'Safety, Comfort, and Session Preferences', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('SAF_3', 'Are there subjects you would prefer your therapist to approach with particular care?', 'Safety, Comfort, and Session Preferences', 1, 'draft_pending_review', true, NOW(), NOW()),
      ('SAF_4', 'What would you like your therapist to do if a question feels uncomfortable or overwhelming?', 'Safety, Comfort, and Session Preferences', 1, 'draft_pending_review', true, NOW(), NOW())
    ON CONFLICT (question_code) DO NOTHING
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DELETE FROM standardized_questions
    WHERE question_code IN (
      'SLP_1','SLP_2','SLP_3','SLP_4',
      'CON_1','CON_2','CON_3','CON_4',
      'PHY_1','PHY_2','PHY_3','PHY_4',
      'LIF_1','LIF_2','LIF_3','LIF_4',
      'COP_1','COP_2','COP_3','COP_4',
      'TRT_1','TRT_2','TRT_3','TRT_4',
      'HIS_1','HIS_2','HIS_3','HIS_4',
      'SAF_1','SAF_2','SAF_3','SAF_4'
    )
  `);
}