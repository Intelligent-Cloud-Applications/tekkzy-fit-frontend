# Tekkzy Fit backend

AWS Lambda + API Gateway (`tekkzy-fit-api`). Prod is us-east-1. Beta/dev is us-east-2.

## Stages

| Branch | Serverless stage | Tables | Razorpay |
| --- | --- | --- | --- |
| `beta` | `dev` | `beta_tekkzyfit_members` (members), `beta_user_profile` (staff/device), `beta_payment`, `beta_institute_product`, `beta_monthly_report` (us-east-2) | test |
| `prod` | `prod` | `tekkzyfit_members` (members), `user_profile` (staff/device), `payment`, `institute_product`, `monthly_report` (us-east-1) | live |

Members for institution `Fitnessworld001` use PK `institutionId` + SK `memberId` in the Tekkzy Fit members tables. Other institutions are not migrated into those tables.

## Deploy

Copy `.env.example` to `.env` and fill keys. Never commit `.env`.

```bash
npm install
npx serverless deploy --stage dev
npx serverless deploy --stage prod
```

## Webhooks

- Beta: `https://g87iwuddyc.execute-api.us-east-2.amazonaws.com/dev/webhooks/razorpay`
- Prod: `https://3yn75zpn5m.execute-api.us-east-1.amazonaws.com/prod/webhooks/razorpay`
