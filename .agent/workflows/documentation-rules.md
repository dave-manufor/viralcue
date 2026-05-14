---
description: Rules for maintaining ViralCue project documentation
---

# Documentation Rules

## docs/suggested-plan.md

- This is the **master implementation plan** for the ViralCue project
- **ALWAYS ask user permission** before making any updates to this file
- **ALWAYS keep synchronized** with implementation progress after permission granted
- When features are completed, update the status in the phase tables
- When architecture changes, update diagrams and component descriptions

## docs/deffered-setup.md

- **ALWAYS update when adding new external service dependencies**
- Keep setup instructions current and accurate
- Include environment variable names and where they go (frontend vs backend)
- Include links to service dashboards and documentation
- No permission needed for routine updates

## General Rules

- All implementation should follow the architecture defined in suggested-plan.md
- Frontend never directly accesses database - always through API
- Real-time updates via WebSocket, not polling

## docs/extension-flow.md

- **ALWAYS update when modifying extension ↔ webapp communication**
- Keep session sync and detection patterns documented
- Update when authentication flow changes
- No permission needed for routine updates

## .env.example Files

- **ALWAYS update when adding new environment variables**
- Root `.env.example` - shared/common variables
- Service-specific `.env.example` files where applicable
- Use descriptive placeholder values (e.g., `your_clerk_publishable_key`)
- Add comments explaining what each variable is for

## External Service Checklist

When adding a new external service dependency, ensure:

1. [ ] Added to `docs/deffered-setup.md` with setup instructions
2. [ ] Environment variables documented with examples
3. [ ] Noted which env vars go in frontend vs backend
4. [ ] Added to Quick Links table
5. [ ] Security notes (e.g., secret keys never in frontend)
6. [ ] Updated `.env.example` files with new variables
