/**
 * Generates structured Emotional Event Reports from ML analysis results.
 * Each report follows the thesis-required format with hedging language.
 */

const TARGET_EMOTIONS = ["Sad", "Angry", "Happy"];

/**
 * Build human-readable speech indicator description from SER probabilities.
 */
function buildSpeechIndicators(ser) {
  if (!ser || !ser.probabilities) {
    return "Speech analysis data was not available for this segment.";
  }

  const probs = ser.probabilities;
  const emotion = ser.emotion;
  const confidence = Math.round((ser.confidence || 0) * 100);

  const indicators = [];
  if (emotion === "Sad") {
    indicators.push("lower vocal energy and slower speech tempo detected");
  } else if (emotion === "Angry") {
    indicators.push("elevated vocal intensity and sharper speech patterns detected");
  } else if (emotion === "Happy") {
    indicators.push("higher vocal energy and varied pitch patterns detected");
  } else {
    indicators.push("neutral vocal tone and steady speech rhythm observed");
  }

  if (confidence > 0) {
    indicators.push(`SER model confidence: ${confidence}%`);
  }

  return indicators.join(". ") + ".";
}

/**
 * Build human-readable facial indicator description from FER probabilities.
 */
function buildFacialIndicators(fer) {
  if (!fer || !fer.probabilities) {
    return "Facial analysis data was not available for this segment.";
  }

  const probs = fer.probabilities;
  const emotion = fer.emotion;
  const confidence = Math.round((fer.confidence || 0) * 100);

  const indicators = [];
  if (emotion === "Sad") {
    indicators.push("downcast gaze and lip compression observed");
  } else if (emotion === "Angry") {
    indicators.push("brow furrowing and tightened jaw muscles observed");
  } else if (emotion === "Happy") {
    indicators.push("smiling expression and relaxed facial muscles observed");
  } else {
    indicators.push("neutral facial expression maintained");
  }

  if (confidence > 0) {
    indicators.push(`FER model confidence: ${confidence}%`);
  }

  return indicators.join(". ") + ".";
}

/**
 * Map intensity score to Low/Moderate/High label.
 */
function mapIntensityLevel(spike) {
  const intensity = spike.intensity || 50;
  if (intensity < 40) return "Low";
  if (intensity <= 70) return "Moderate";
  return "High";
}

/**
 * Build summary sentence with hedging language.
 */
function buildSummary(question, dominantEmotion, ferEmotion, serEmotion) {
  const emotionWord = {
    Sad: "sadness",
    Angry: "anger",
    Happy: "happiness",
    Neutral: "neutral affect",
  }[dominantEmotion] || "emotional response";

  const topic = question
    ? `the topic of "${question.length > 60 ? question.slice(0, 57) + "..." : question}"`
    : "the question posed";

  if (ferEmotion === dominantEmotion && serEmotion === dominantEmotion) {
    return `The client's response regarding ${topic} was accompanied by ${emotionWord}, detected across both facial and speech modalities.`;
  }
  if (ferEmotion === dominantEmotion) {
    return `The client's response regarding ${topic} appeared associated with ${emotionWord}, primarily detected through facial expression analysis.`;
  }
  if (serEmotion === dominantEmotion) {
    return `The client's response regarding ${topic} may indicate ${emotionWord}, primarily detected through speech pattern analysis.`;
  }
  return `The client's response regarding ${topic} was accompanied by indicators of ${emotionWord}.`;
}

/**
 * Generate the full emotional event report from ML results.
 *
 * @param {Object} mlResult - Raw ML service response
 * @param {string[]} questions - Array of question texts
 * @param {number} sessionDurationSeconds - Total interview duration in seconds
 * @returns {{ emotional_events: Object[], session_highlights: Object }}
 */
export function generateEmotionalEventReport(mlResult, questions, sessionDurationSeconds = 0) {
  const perQuestion = mlResult.per_question || [];
  const spikes = mlResult.spikes || [];
  const totalQuestions = perQuestion.length;

  // Average seconds per question for timestamp estimation
  const secondsPerQuestion = totalQuestions > 0
    ? Math.floor(sessionDurationSeconds / totalQuestions)
    : 30;

  const spikeIndices = new Set(spikes.map((s) => s.question_index));

  const emotionalEvents = [];
  let eventNumber = 0;

  for (const pq of perQuestion) {
    const idx = pq.question_index;

    // Only create an event when a spike is detected AND emotion is Sad, Angry, or Happy
    if (!spikeIndices.has(idx)) continue;
    if (!TARGET_EMOTIONS.includes(pq.combined_emotion)) continue;

    eventNumber++;

    const spike = spikes.find((s) => s.question_index === idx);
    const ferEmotion = pq.fer?.emotion || null;
    const serEmotion = pq.ser?.emotion || null;
    const dominantEmotion = pq.combined_emotion;

    // Confidence: use the modality that matches the combined emotion
    let confidence = 0;
    if (ferEmotion === dominantEmotion && pq.fer) {
      confidence = Math.round(pq.fer.confidence * 100);
    } else if (serEmotion === dominantEmotion && pq.ser) {
      confidence = Math.round(pq.ser.confidence * 100);
    } else if (pq.fer) {
      confidence = Math.round(pq.fer.confidence * 100);
    } else if (pq.ser) {
      confidence = Math.round(pq.ser.confidence * 100);
    }

    const questionText = (typeof questions[idx] === "object" ? questions[idx]?.text : questions[idx]) || `Question ${idx + 1}`;

    emotionalEvents.push({
      event_number: eventNumber,
      timestamp: formatTimestamp(idx * secondsPerQuestion),
      question: questionText,
      transcript: pq.transcript_text || "[Audio response recorded]",
      dominant_emotion: dominantEmotion,
      emotion_confidence: confidence,
      speech_indicators: buildSpeechIndicators(pq.ser),
      facial_indicators: buildFacialIndicators(pq.fer),
      intensity_level: mapIntensityLevel(spike || {}),
      summary: buildSummary(questionText, dominantEmotion, ferEmotion, serEmotion),
    });
  }

  // Session highlights
  const emotionCounts = {};
  let highestIntensityEvent = null;
  let highestIntensity = 0;

  for (const event of emotionalEvents) {
    emotionCounts[event.dominant_emotion] = (emotionCounts[event.dominant_emotion] || 0) + 1;

    const intensityMap = { Low: 1, Moderate: 2, High: 3 };
    const level = intensityMap[event.intensity_level] || 0;
    if (level > highestIntensity) {
      highestIntensity = level;
      highestIntensityEvent = event.event_number;
    }
  }

  const mostFrequentEmotion = Object.entries(emotionCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([emotion]) => emotion)[0] || "Neutral";

  const spikeIndicesList = spikes
    .filter((s) => TARGET_EMOTIONS.includes(
      perQuestion.find((pq) => pq.question_index === s.question_index)?.combined_emotion || ""
    ))
    .map((s) => s.question_index + 1);
  const questionsWithResponses = spikeIndicesList.map((qNum) => `Q${qNum}`);

  // Build overall summary
  const eventCount = emotionalEvents.length;
  let overallSummary;
  if (eventCount === 0) {
    overallSummary = "No significant emotional spikes were detected during this interview session.";
  } else if (eventCount === 1) {
    const e = emotionalEvents[0];
    const emotionWord = { Sad: "sadness", Angry: "anger", Happy: "happiness" }[e.dominant_emotion] || "emotional response";
    overallSummary = `One emotional event was detected, associated with ${emotionWord}. ${e.summary}`;
  } else {
    const emotionLabels = [...new Set(emotionalEvents.map((e) => {
      return { Sad: "sadness", Angry: "anger", Happy: "happiness" }[e.dominant_emotion] || e.dominant_emotion;
    }))];
    const emotionStr = emotionLabels.length > 1
      ? `${emotionLabels.slice(0, -1).join(", ")} and ${emotionLabels[emotionLabels.length - 1]}`
      : emotionLabels[0];
    overallSummary = `${eventCount} emotional events were detected during this session, with ${emotionStr} being ${eventCount > 2 ? "the most frequently observed responses" : "observed responses"}. Emotional responses appeared concentrated during questions that may involve personal or sensitive topics.`;
  }

  return {
    emotional_events: emotionalEvents,
    session_highlights: {
      total_events: eventCount,
      most_frequent_emotion: mostFrequentEmotion,
      highest_intensity_event: highestIntensityEvent,
      questions_with_responses: questionsWithResponses,
      overall_summary: overallSummary,
    },
  };
}

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
