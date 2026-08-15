# Anumata Backend Guide

## Overview

The backend consists of two services:
1. **Node.js/Express** (port 5000) — REST API, authentication, database
2. **Python/FastAPI** (port 8001) — AI pipeline (FER, SER, LER, STT, Fusion, Report)

---

## Directory Structure

```
src/
├── app.js                          # Express app setup, middleware, route mounting
├── server.js                       # Entry point, starts HTTP server
│
├── core/
│   ├── database/
│   │   └── db.js                   # PostgreSQL connection pool (singleton)
│   ├── errors/
│   │   ├── AppError.js             # Base error class
│   │   ├── ValidationError.js      # 422 errors
│   │   └── NotFoundError.js        # 404 errors
│   ├── http/
│   │   ├── apiResponse.js          # sendSuccess() helper
│   │   └── healthRoutes.js         # /health endpoints
│   └── middleware/
│       ├── Auth.js                 # JWT verification
│       ├── AuthTokenService.js     # JWT sign/verify
│       ├── LoginRateLimiter.js     # Rate limiting
│       ├── asyncHandler.js         # Async error wrapper
│       ├── errorHandler.js         # Global error handler
│       ├── notFoundHandler.js      # 404 catch-all
│       └── requireUser.js          # Role guard
│
├── modules/
│   ├── users/                      # Authentication
│   ├── patients/                   # Patient CRUD
│   ├── question_sets/              # Question set CRUD
│   ├── interview_links/            # Interview link management
│   ├── sessions/                   # Session CRUD
│   ├── emotion_analysis/           # AI analysis orchestration
│   └── dashboard/                  # Dashboard stats
│
└── ai/                             # Python AI service (separate process)
    ├── main.py                     # FastAPI app
    ├── config.py                   # All configuration
    ├── ai_service.py               # Pipeline orchestrator
    ├── fer/                        # Facial Emotion Recognition
    ├── ser/                        # Speech Emotion Recognition
    ├── ler/                        # Language Emotion Recognition
    ├── stt/                        # Speech-to-Text
    ├── fusion/                     # Multimodal fusion
    ├── report/                     # LLM report generation
    └── models/                     # Model weight files
```

---

## Module Pattern

Every module follows the same layered pattern:

```
module/
├── domain/
│   └── I*Repo.js                   # Repository interface (abstract)
├── application/
│   ├── *Service.js                 # Business logic
│   └── validators/
│       └── *Validator.js           # Input validation
├── infrastructure/
│   └── *Repo.js                    # PostgreSQL implementation
└── interface/
    ├── *Routes.js                  # Express routes
    └── controller/
        └── *Controller.js          # Route handlers
```

**Data flow through a module:**
```
HTTP Request
    → Routes (decides which handler)
    → Controller (extracts params, calls service)
    → Service (business logic, validation)
    → Repository (database queries)
    → Response
```

---

## Core Modules

### Database — `core/database/db.js`

Singleton PostgreSQL pool. Max 20 connections.

```javascript
import db from "./core/database/db.js";

// Simple query
const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);

// Transaction
const result = await db.transaction(async (client) => {
    await client.query("INSERT INTO ...", [...]);
    await client.query("UPDATE ...", [...]);
    return result;
});
```

### Authentication — `core/middleware/Auth.js`

Reads JWT from cookie (`req.cookies.token`) or Authorization header. Sets `req.user = { id, email, role }`.

```javascript
// Protected route
router.get("/profile", authMiddleware, requireTherapist, handler);

// req.user is available in handler
const userId = req.user.id;
```

### Error Handling

All errors flow through `AppError` hierarchy:
```javascript
// Throw operational errors
throw new ValidationError("Email is required");
throw new NotFoundError("Patient not found");
throw new AppError("Service unavailable", 503, "SERVICE_ERROR");

// asyncHandler catches thrown errors and forwards to errorHandler
router.get("/", asyncHandler(async (req, res) => { ... }));
```

### Response Format

All successful responses:
```javascript
sendSuccess(res, { statusCode: 200, message: "Success", data: result });
// → { status: "success", message: "Success", data: result }
```

---

## Important Modules

### Emotion Analysis — `modules/emotion_analysis/`

This is the most important module. It bridges Node.js with the Python AI service.

**Route:** `POST /api/emotion/token/:token/analyze` (public, multer upload)

**Flow:**
1. Controller receives uploaded files + token
2. Service finds interview link by token
3. Service builds FormData with files + questions
4. Service calls Python AI service at `http://localhost:8001/api/analyze`
5. Service builds transcript from AI results
6. Service generates emotional event report
7. Repository saves session to database
8. Interview link marked as "completed"

**Key file:** `EmotionAnalysisService.js` — This is where Python results become database records.

### Sessions — `modules/sessions/`

**Routes:** CRUD for sessions (all protected by therapist auth)

**Key queries in SessionRepo:**
- `create()` — INSERT with all JSONB columns
- `findById()` — JOIN with patients, interview_links, question_sets
- `findByTherapistId()` — Paginated list
- `updateNotes()` — Therapist notes

### Patients — `modules/patients/`

**Routes:** CRUD for patients (all protected)

**Key feature:** `findById()` includes session_count, risk_level, and last_interview via subqueries.

### Interview Links — `modules/interview_links/`

**Routes:** CRUD (protected) + token-based routes (public)

**Public routes:**
- `GET /token/:token` — Get link details (patient name, questions)
- `POST /token/:token/start` — Set status to "in_progress"
- `POST /token/:token/complete` — Set status to "completed"

---

## Python AI Service

### Entry Point — `ai/main.py`

FastAPI app on port 8001. Preloads all models at startup.

**Endpoints:**
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Model status |
| POST | `/api/analyze` | Full interview analysis |
| POST | `/api/fer/predict` | Single image FER |
| POST | `/api/ser/predict` | Single audio SER |
| POST | `/api/ler/predict` | Single text LER |

### Pipeline — `ai/ai_service.py`

`analyze_interview(questions, frames, audios, audio_filenames)` orchestrates:

```
Per question: FER → SER → STT → LER → Fusion
After all:    Distribution → Risk → Spikes → Report
```

### Configuration — `ai/config.py`

All config uses dataclasses:
- `FusionConfig` — weights (SER=0.40, FER=0.40, LER=0.20)
- `RiskConfig` — thresholds (High > 60%, Moderate > 30%)
- `FERConfig`, `SERConfig`, `LERConfig`, `STTConfig` — model-specific settings
- `OllamaConfig` — LLM settings (llama3.2:3b, 180s timeout)

---

## Database Schema

### `users` (therapists)
- `user_id` (PK), `email`, `password_hash`, `full_name`

### `patients`
- `patient_id` (PK), `therapist_id` (FK), `full_name`, `age`, `gender`, `primary_concern`

### `question_sets`
- `question_set_id` (PK), `therapist_id` (FK), `name`, `description`, `questions` (jsonb)

### `interview_links`
- `interview_link_id` (PK), `therapist_id` (FK), `patient_id` (FK), `question_set_id` (FK), `token`, `status`

### `sessions`
- `session_id` (PK), `interview_link_id` (FK), `patient_id` (FK), `therapist_id` (FK)
- `transcript` (jsonb), `emotion_summary` (jsonb), `risk_level`, `emotional_spikes` (jsonb)
- `emotional_events` (jsonb), `session_highlights` (jsonb), `report` (jsonb), `notes`

---

## How to Run

```bash
# Start Python AI service
cd anumata-be/src/ai
python main.py  # Port 8001

# Start Node.js backend
cd anumata-be
npm run dev  # Port 5000

# Run migrations
cd anumata-be
npm run migrate
```
