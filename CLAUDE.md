# plasyect-intelligence-dashboard

Vite + React + TS + Tailwind dashboard with an Express backend. Data: Firebird (legacy) being
migrated to Supabase/Postgres (direct PG connection). Gemini via `@google/genai`. Charts: recharts + d3.

## Stack / GCloud
- Projects: `plasyect-intelligence-prod`, `dashboard-plasyect`.
- PDF: jspdf. Motion: `motion`. Compression: fflate.

## Commands
- Frontend dev: `npm run dev` · build: `npm run build` · lint: `npm run lint`
- Backend: `npm run backend:dev`, `backend:build`, `backend:test`, `backend:deploy`
- Data quality: `npm run` scripts for data verification/quality checks.

## Notes
- "Dashboard Ejecutivo" uses real Firebird data; backend has direct Postgres→Supabase connection.
- Verify data scripts pass before shipping dashboard changes. Spanish UI.

## Skill discovery

Follow the "Skill discovery" section of `AGENTS.md`: use the `find-skills` skill
(`.claude/skills/find-skills/`) before hand-rolling a specialized workflow, and
never install anything without explicit approval.
