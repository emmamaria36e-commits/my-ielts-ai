# My IELTS AI — Current Project State

Last updated: 2026-08-11

## 1. Product Goal

My IELTS AI helps IELTS learners turn vocabulary they are studying into contextual listening material. It is intended for learners who recognize words in isolation but need practice hearing them in continuous, natural speech.

The current core flow is:

1. Enter target words or phrases.
2. Select IELTS Listening Section 1–4 and one playback voice.
3. Generate an IELTS Listening passage that contains every target item in its exact form.
4. Generate Azure Speech audio from the validated passage.
5. Play the audio and review the transcript with target-word highlighting.

## 2. Current MVP Scope

The following capabilities exist in the current code:

- Target-word and phrase input, delimiter parsing, whitespace normalization, duplicate removal, validation, and a 20-item limit.
- IELTS Listening Section 1–4 selection; Section controls dialogue/monologue structure and listening style.
- Single playback voice selection from a server-side allowlist.
- Server-side DeepSeek passage generation through `/api/generate`.
- Section-specific Prompt Builder with an exact numbered target-word checklist and dynamic suggested passage length.
- Strict JSON, plain-text, HTML, structure, and exact target-word validation.
- Generation Pipeline V2/V2.1 with one repair or regeneration recovery call.
- Azure Speech synthesis through `/api/speech`, with trusted SSML generation and MP3 output.
- Removal of trusted `Speaker A/B/C:` line labels before speech synthesis while preserving them in the displayed transcript.
- Custom audio playback controls for play/pause, seeking, skipping, volume, and speed.
- Safe transcript rendering and target-word highlighting without rendering model-provided HTML.
- Loading, long-audio waiting, recoverable failure, and terminal failure feedback.
- Anonymous local JSONL statistics for text generation and speech duration; logs do not contain passages, complete word lists, or credentials.

## 3. Explicitly Deferred Features

The following are intentionally deferred and are not current bugs:

- User accounts, cloud synchronization, and learning history.
- Complex Learning Engine strategies.
- Multi-role TTS, audio stitching, sentence timestamps, and Voice Studio/voice cloning.
- IELTS question generation, answer generation, and explanations.
- Fill-in-the-blank practice and sentence-level intensive listening.
- Topic and difficulty systems beyond the current minimal Section and difficulty parameters.
- Quality Check and separate Schema Validator subsystems beyond current inline validation.
- Payment, subscriptions, and social features.
- Expansion into IELTS Writing, Reading, or Speaking tools.
- Frontend framework migration.

## 4. Current Architecture

```text
Vanilla HTML/CSS/JavaScript frontend
              ↓
       Node.js HTTP backend
              ↓
  /api/generate → DeepSeek API
  /api/speech   → Azure Speech REST API
```

Key files:

- `index.html`: single-page product structure.
- `js/generator.js`: input state, generation flow, result rendering, and speech request coordination.
- `js/player.js`: custom audio player.
- `js/services/aiService.js`: frontend AI provider selection and common entry point.
- `js/services/apiProvider.js`: same-origin `/api/generate` client.
- `js/services/mockProvider.js`: lightweight local Mock provider.
- `js/services/speechService.js`: same-origin `/api/speech` client.
- `js/services/wordParser.js`: target-item parsing and normalization.
- `server.js`: static serving, request validation, DeepSeek and Azure calls, recovery pipelines, rate limiting, and anonymous statistics.
- `server/promptBuilder.js`: initial and repair Prompt construction only.
- `test/passageValidation.test.js`: current automated test suite.

No API credential is stored in frontend code or documented here.

## 5. Environment Variables

Current environment variable names are:

- `AI_API_KEY`
- `AI_API_ENDPOINT`
- `AI_MODEL`
- `AI_PROVIDER`
- `PORT`
- `SPEECH_KEY`
- `SPEECH_REGION`

Local values belong in the ignored `.env` file. `.env.example` contains only names, empty credential fields, and non-secret example configuration.

## 6. Generation Pipeline

Input to `/api/generate` includes target words, IELTS Section, selected voice, and difficulty. The server validates and normalizes these fields before building a trusted Prompt.

The initial Prompt:

- Places target items in a numbered exact-word checklist in the User Prompt.
- Requires each item at least once in its original lexical form.
- Disallows plural, tense, and derived-form substitutions.
- Requests strict JSON with `title`, `passage`, and an internal `coverage` self-check field.
- Uses temperature `0.3` and a target-count-dependent suggested length.

The server does not trust the model's `coverage` field. It parses strict JSON and inspects the actual passage. Target matching applies Unicode normalization, case normalization, punctuation handling, and complete token-sequence matching. It does not stem words: for example, `study` does not match `studying`, and `planet` does not match `planets`.

The maximum model-call budget is **2 calls per user request**:

1. Call 1 generates the initial passage.
2. If it is valid, return immediately.
3. If no more than 3 target items are missing and the missing ratio is no more than 25%, Call 2 minimally repairs the existing passage.
4. For a larger missing set, invalid JSON, or invalid result structure, Call 2 regenerates the passage.
5. The second result passes through the same strict validation.
6. Only final failure is returned to the frontend; the first internal failure is not shown to the user.

## 7. Speech Pipeline

The browser sends the validated passage and one product voice key to `/api/speech`. The server validates text length, rejects HTML, maps the product voice key to a trusted Azure voice, removes trusted dialogue labels, XML-escapes the remaining text, and builds SSML.

The backend calls the Azure Speech REST synthesis endpoint and returns `audio/mpeg` to the browser. The player uses a temporary browser object URL.

Current reliability behavior:

- Per-attempt timeout: **90 seconds**.
- One retry occurs only when Azure explicitly returns HTTP 502.
- A timeout does not trigger another long synthesis request.
- The frontend shows a long-text waiting message after 12 seconds.

Known limitations:

- Speech synthesis is synchronous and returns only after the complete MP3 is ready.
- Audio is not cached or persisted.
- Long passages can take roughly 30–90 seconds depending on length and Azure response time.

## 8. Validation and Tests

Commands:

```text
npm run check
npm test
```

As of this checkpoint, the suite contains **34 tests** and passes completely. Coverage includes:

- Request validation and Section rules.
- Prompt checklist, dynamic length, and repair protections.
- Strict JSON/plain-text/HTML validation.
- Exact word and phrase matching, including word-form boundaries.
- Two-call repair/regenerate behavior and failure budget.
- Safe transcript rendering.
- Mock Provider contract.
- Speech request and SSML safety.
- Azure 502 retry and timeout-without-retry behavior.
- Loading and long-audio waiting UI.
- Target-item parsing, deduplication, validation, and limits.

## 9. Current Known Issues

No confirmed unresolved blocking functional bug is recorded at this checkpoint.

Operational limitations that remain:

- Azure Speech can still exceed 90 seconds under slow conditions or unusually long input.
- Audio has no cache or persistence, so repeated generation repeats the provider call.
- Anonymous JSONL statistics are local files and are not aggregated into an analysis dashboard.

## 10. Security Status

- API keys are loaded by the Node backend from environment variables and are not sent to the browser.
- `.env` and `.env.*` are ignored, with `.env.example` explicitly allowed.
- AI output is treated as untrusted, strictly validated, and displayed as text.
- Speech text is validated and XML-escaped before entering trusted SSML.
- Basic rate limiting: **IMPLEMENTED**. AI and Speech have separate in-memory, per-address limits of 20 requests per 60 seconds.
- Closed-beta invitation/access code: **NOT IMPLEMENTED**.
- Daily per-user or global quota: **NOT IMPLEMENTED**.
- Explicit concurrency control: **NOT IMPLEMENTED**.
- User authentication: **NOT IMPLEMENTED**.
- Persistent audit/security event storage: **NOT IMPLEMENTED**.

These missing controls must be assessed before public accessibility.

## 11. Deployment Status

- Current use is local through `http://localhost:3000`.
- No public deployment is recorded.
- No production deployment configuration is present in the repository.
- The application has a server-side runtime and environment-variable boundary, but closed-beta access protection and deployment-specific security review are not complete.

## 12. Current Product Decisions

- Keep the current Vanilla HTML/CSS/JavaScript frontend while it remains sufficient for the MVP.
- Use the minimal Node.js backend as the trusted boundary for AI and Speech credentials.
- Keep DeepSeek and Azure credentials server-side only.
- Limit text generation to at most two model calls per request.
- Require exact target-word matching; do not accept inflections or derived forms as substitutes.
- Use IELTS Listening Section 1–4 to determine passage structure; Voice controls playback only.
- Keep Prompt Builder focused on Prompt construction rather than strategy, validation, or future Learning Engine logic.
- Do not expose the first internal generation failure or repair step to users.
- Keep Mock lightweight; prioritize real provider behavior.
- Do not expand beyond the IELTS Listening product boundary during the current MVP.
- Do not add deferred systems until a concrete current need is confirmed.

## 13. Next Immediate Goal

Complete closed beta launch security audit and necessary fixes, then deploy for a closed test with the first 5–10 users.

## 14. Next Steps

### P0

1. Run a closed-beta security audit before making the application publicly accessible.
2. Recheck repository history and deployment configuration for Secret exposure.
3. Assess and implement the minimum closed-beta access protection.
4. Assess rate limiting, daily quota, and concurrency controls against provider cost and abuse risk.
5. Prepare a secure deployment configuration and environment-variable setup.

### P1

1. Deploy to a restricted closed-beta environment.
2. Run end-to-end production smoke tests without high-volume paid API calls.
3. Invite the first 5–10 users and collect structured reliability feedback.
4. Review anonymous generation and Speech statistics for failure rate, latency, and cost risk.

### P2

1. Prioritize only issues supported by closed-beta evidence.
2. Reassess caching or persistence if repeated Speech cost or latency is material.
3. Revisit deferred learning features only after the core listening flow is stable.

## 15. How to Resume Work

Future Codex work should begin by reading, in order:

1. `docs/PROJECT_STATE.md`
2. `docs/ARCHITECTURE.md`
3. `docs/DECISION_LOG.md`
4. `docs/DEVELOPMENT_LOG.md`
5. `package.json`
6. The code directly related to the requested task

Do not redesign the architecture or previously settled decisions without first identifying a concrete reason.
