# ОБДС

Multiplayer category game: one letter, loads of words.

## Local development

```bash
npm install
npm run dev:backend
npm run dev
```

Run the backend and frontend commands in separate terminals. Convex stores the
development deployment URL in `.env.local`, which is intentionally ignored by
Git.

## Deployment

The frontend is a Vite app and can be deployed directly to Vercel. The
`vercel.json` rewrite keeps client-side room URLs working when opened directly.

The app is connected to Convex. In Vercel, add a production
`CONVEX_DEPLOY_KEY` and build the Convex and frontend deployments together with:

```bash
npx convex deploy --cmd "npm run build"
```

The current game loop is still local and uses simulated players. Convex room
state will replace it in the next implementation step.
