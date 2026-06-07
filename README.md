# ОБДС

Multiplayer category game: one letter, loads of words.

## Local development

```bash
npm install
npm run dev
```

## Deployment

The frontend is a Vite app and can be deployed directly to Vercel. The
`vercel.json` rewrite keeps client-side room URLs working when opened directly.

The intended production backend is Convex. Its deployment URL should be exposed
to Vite as `VITE_CONVEX_URL`; the Convex and frontend deployments can then be
built together with:

```bash
npx convex deploy --cmd "npm run build"
```

The current game loop is still local and uses simulated players. Convex room
state will replace it in the next implementation step.
