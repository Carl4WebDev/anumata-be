import ValidationError from "../../../../core/errors/ValidationError.js";

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
      if (!text) {
        questionErrors.push(`Question ${i + 1}: text is required`);
      } else {
        normalized.push({
          text,
          order: typeof q === "object" && q?.order !== undefined ? q.order : i,
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
      data.questions = questions.map((q, i) => ({
        text: typeof q === "string" ? q.trim() : q.text?.trim(),
        order: typeof q === "string" ? i : (q.order || i),
      }));
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError("Validation failed", errors);
  }

  return data;
}
