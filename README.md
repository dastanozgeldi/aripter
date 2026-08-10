# Aripter

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
- Convex selects each letter without repeats and owns the shared round deadline
- the host can open a majority vote to replace the current letter-round
- rooms show their letter history and end after the selected alphabet is exhausted
- answers save privately during play and lock at the deadline
- the first player to fill every category can start a shared five-second final countdown
- locked answers are revealed to everyone one category at a time
- the host advances the reveal and opens the results
- players approve or reject each other’s revealed answers
- only answers with a strict player majority score one word
- every tied winner gets a point
- cumulative points survive when the host opens another round

Word legitimacy checks remain intentionally outside the MVP.
