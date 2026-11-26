# Kitaab API (`com.jeweller.ledger`)

Node + Express + TiDB Cloud (PostgreSQL) + Cloudinary folder `kitaab`.

## Setup

```bash
cp .env.example .env
npm install
npm run apply-schema
npm run migrate
npm run seed-admin
npm start
```

Health: `GET /health`
