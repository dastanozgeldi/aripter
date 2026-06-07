# Wordlord

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

The Convex room entry flow is live:

- hosts create rooms with shareable `?room=CODE` links
- each browser keeps a private guest token in local storage
- invited players join by name
- the lobby player list and ready states update in realtime
- presence updates live, disconnected players can reclaim their seat, and host
  authority transfers when needed
- players can explicitly leave; abandoned rooms expire after 24 hours
- only the host can start after everyone is ready
- Convex selects the letter and owns the shared round deadline
- answers save privately during play and lock at the deadline
- locked answers are revealed to everyone one category at a time
- the host advances the reveal and opens the results
- non-empty answers score one word; every tied winner gets a point
- cumulative points survive when the host opens another round

Word legitimacy checks remain intentionally outside the MVP.
