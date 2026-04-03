# Campaign Launcher

Production-grade Smartlead campaign launcher for cold email teams. Upload your CSVs, pick a schedule template, and launch or save as draft — all from a clean browser UI.

## Setup in 3 commands

```bash
cp .env.example .env      # add your Smartlead API key
npm install
npm run dev
```

## .env setup

```env
VITE_SMARTLEAD_API_KEY=your_api_key_here
VITE_SMARTLEAD_BASE_URL=https://server.smartlead.ai/api/v1
```

## CSV formats

### leads.csv
| email | first_name | last_name | … |
|-------|-----------|-----------|---|
| Required: `email` column. Any extra columns are forwarded to Smartlead. Warn at >20,000 rows. |

### sequence.csv
| seq_number | subject | body | delay_days |
|------------|---------|------|------------|
| All four columns required. `seq_number` is 1-based. `delay_days` = days after previous step. |

### inboxes.csv
| email_account_id | … |
|-----------------|---|
| Required: `email_account_id` (numeric Smartlead inbox ID). Warn at >1,500 rows. |

## Deploy to Vercel

```bash
npm run build   # outputs to dist/
vercel --prod
```

Set `VITE_SMARTLEAD_API_KEY` and `VITE_SMARTLEAD_BASE_URL` as Vercel environment variables.

## Architecture

| File | Role |
|------|------|
| `src/App.tsx` | View state machine (form → progress → result) |
| `src/views/LaunchForm.tsx` | Upload form with drag-drop zones and validation |
| `src/views/Progress.tsx` | Live 8-step pipeline progress with retry UI |
| `src/views/Result.tsx` | Launch/draft/error result screen |
| `src/lib/pipeline.ts` | Async generator pipeline — yields step updates |
| `src/lib/smartlead.ts` | Typed Smartlead API client (axios) |
| `src/lib/csv.ts` | CSV parsing + column validation (Papa Parse) |
| `src/lib/templates.ts` | Schedule template definitions |
