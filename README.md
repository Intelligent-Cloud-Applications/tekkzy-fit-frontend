# Tekkzy Fit frontend

React + Vite gym desk app. Talks to the Tekkzy Fit API.

## Branches

- `beta` — website against the **dev** API and beta DynamoDB tables
- `prod` — website against the **prod** API and `userprofile` / `payments`

## Run

```bash
npm install
cp .env.example .env
npm run dev:client
```

Set `VITE_API_URL` and `VITE_GYM_API_KEY` in `.env`. Do not commit those files.
