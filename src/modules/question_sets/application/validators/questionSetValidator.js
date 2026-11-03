import ValidationError from "../../../../core/errors/ValidationError.js";

export const MAX_FOLLOW_UP_LENGTH = 300;

/**
 * Optional therapist-written follow-up for one question ("What did that feel
 * like for you?"), asked once in the interview when the answer is short.
 * Returns `{ follow_up }` to spread into the question, or {} when there is none.
 */
function followUpOf(q, i, questionErrors) {
  if (typeof q !== "object" || q === null || q.follow_up === undefined || q.follow_up === null) return {};
  if (typeof q.follow_up !== "string") {
    questionErrors.push(`Question ${i + 1}: follow-up must be text`);
    return {};
  }
  const followUp = q.follow_up.trim();
  if (followUp.length > MAX_FOLLOW_UP_LENGTH) {
    questionErrors.push(`Question ${i + 1}: follow-up must not exceed ${MAX_FOLLOW_UP_LENGTH} characters`);
    return {};
  }
  return followUp ? { follow_up: followUp } : {};
}

/**
 * A question the therapist marked as sensitive: Amumata says a soft line
 * before asking it and checks in sooner if the patient struggles.
 * Returns `{ sensitive: true }`, or {} when not marked.
 */
function sensitiveOf(q) {
  return typeof q === "object" && q !== null && q.sensitive === true ? { sensitive: true } : {};
}

export function validateQuestionSet({ name, description, questions }) {
  const errors = {};

  if (!name?.trim()) {
    errors.name = "Question set name is required";
  } else if (name.trim().length > 200) {
    errors.name = "Name must not exceed 200 characters";
  }

  if (description !== undefined && description !== null && description.length > 500) {
    errors.description = "Description must not exceed 500 characters";
  }

  if (!questions || !Array.isArray(questions)) {
    errors.questions = "Questions must be an array";
  } else if (questions.length === 0) {
    errors.questions = "At least one question is required";
  } else if (questions.length > 20) {
    errors.questions = "Maximum 20 questions allowed";
  } else {
    // Normalize questions: accept strings or { text, order } objects
    const normalized = [];
    const questionErrors = [];

    questions.forEach((q, i) => {
      const text = typeof q === "string" ? q.trim() : q?.text?.trim();
      const followUp = followUpOf(q, i, questionErrors);
      if (!text) {
        questionErrors.push(`Question ${i + 1}: text is required`);
      } else {
        normalized.push({
          text,
          order: typeof q === "object" && q?.order !== undefined ? q.order : i,
          ...followUp,
          ...sensitiveOf(q),
        });
      }
    });

    if (questionErrors.length > 0) {
      errors.questions = questionErrors;
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError("Validation failed", errors);
    }

    return {
      name: name.trim(),
      description: description?.trim() || "",
      questions: normalized,
    };
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError("Validation failed", errors);
  }

  return {
    name: name.trim(),
    description: description?.trim() || "",
    questions: questions.map((q, i) => ({
      text: typeof q === "string" ? q.trim() : q.text.trim(),
      order: typeof q === "string" ? i : (q.order || i),
    })),
  };
}

export function validateQuestionSetUpdate({ name, description, questions }) {
  const errors = {};
  const data = {};

  if (name !== undefined) {
    if (!name?.trim()) {
      errors.name = "Name cannot be empty";
    } else if (name.trim().length > 200) {
      errors.name = "Name must not exceed 200 characters";
    } else {
      data.name = name.trim();
    }
  }

  if (description !== undefined) {
    if (description.length > 500) {
      errors.description = "Description must not exceed 500 characters";
    } else {
      data.description = description.trim();
    }
  }

  if (questions !== undefined) {
    if (!Array.isArray(questions)) {
      errors.questions = "Questions must be an array";
    } else if (questions.length === 0) {
      errors.questions = "At least one question is required";
    } else if (questions.length > 20) {
      errors.questions = "Maximum 20 questions allowed";
    } else {
      const questionErrors = [];
      data.questions = questions.map((q, i) => ({
        text: typeof q === "string" ? q.trim() : q.text?.trim(),
        order: typeof q === "string" ? i : (q.order || i),
        ...followUpOf(q, i, questionErrors),
        ...sensitiveOf(q),
      }));
      if (questionErrors.length > 0) errors.questions = questionErrors;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError("Validation failed", errors);
  }

  return data;
}
