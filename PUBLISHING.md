# Publishing Ninja Rider on Netlify

Ninja Rider and your portfolio are **two separate Netlify sites** on your `codebread.fun` domain:

| Site | Folder | Address |
|---|---|---|
| The game, its API and its admin page | `~/projecthub/ohter/horse` | `https://games.codebread.fun` (admin: `/admin`) |
| Your portfolio | `~/portfolio/MyPortfolio` | `https://portfolio.codebread.fun` |

The portfolio's **Games** section shows the game inside the page (an iframe). Publish the game first, because the portfolio loads it from `games.codebread.fun`.

## What is in this folder

| Path | What it is |
|---|---|
| `public/` | Everything visitors download: the game (`index.html`, `js/`), the admin page (`admin/`) and `cover.jpg` |
| `api/` | The code for players, rounds, leaderboard, feedback and admin stats |
| `netlify/functions/api.ts` | The one Netlify Function. It answers every `/api/...` request by calling the code in `api/` |
| `netlify.toml` | Netlify settings: serve `public/`, which sites may show the game in an iframe, keep the admin page private |
| `scripts/dev-server.ts` | Runs the whole site on your computer (`npm run dev`) |
| `.env.example` | The two settings the API needs |

---

## Part 1: publish the game at games.codebread.fun

### 1. Put the game on GitHub

Create an empty repository on GitHub called `ninja-rider` (no README), then run each of these:

```bash
cd ~/projecthub/ohter/horse
```

```bash
git init -b main && git add -A && git commit -m "Ninja Rider game with leaderboard and admin"
```

```bash
git remote add origin https://github.com/Ankitprajapati24/ninja-rider.git && git push -u origin main
```

`.env.local` (your local test password) is in `.gitignore`, so it is never uploaded.

### 2. Create the Netlify site

1. In Netlify: **Add new project → Import an existing project → GitHub** → pick `ninja-rider`.
2. Leave every build field as Netlify fills it: **Base directory** empty, **Build command** empty, **Publish directory** `public`. `netlify.toml` sets these.
3. Click **Deploy**. The game loads, but plays offline until steps 3 to 5 are done.

### 3. Create the database (free)

1. Sign up at <https://neon.tech> and create a project. Pick the region closest to your players, for example **AWS Asia Pacific (Singapore)** for India.
2. On the project dashboard click **Connect** and copy the connection string. It starts with `postgresql://` and ends with `?sslmode=require`.
3. In Netlify: your game site → **Site configuration → Environment variables → Add a variable**. Set the key to `DATABASE_URL`, paste the string as the value, and tick **Contains secret values**.

The tables create themselves on first use.

If you would rather use **Netlify DB** (Netlify's built-in Neon), that works too. It sets `NETLIFY_DATABASE_URL`, which the game also reads. Claim the database into a Neon account when Netlify asks you to, or it will be removed.

### 4. Set the admin password

Add a second environment variable `ADMIN_PASSWORD`. Use a long password only you know (16+ characters), and tick **Contains secret values**.

### 5. Redeploy

**Deploys → Trigger deploy → Deploy project**. Environment variables only reach new deploys.

### 6. Connect games.codebread.fun

Netlify: game site → **Domain management → Add a domain** → type `games.codebread.fun` → **Verify** → **Add domain**.

What happens next depends on where `codebread.fun`'s DNS is managed. Do it the same way you did for `portfolio.codebread.fun`:

- **The domain uses Netlify DNS** (its nameservers look like `dns1.p0X.nsone.net`): Netlify adds the record itself. Nothing else to do.
- **The domain's DNS is somewhere else** (GoDaddy, Hostinger, Namecheap, Cloudflare, …): at that provider add one record:

  | Type | Name / Host | Value / Points to |
  |---|---|---|
  | `CNAME` | `games` | your game site's Netlify address, for example `ninja-rider-abc123.netlify.app` |

  On Cloudflare, set the record to **DNS only** (grey cloud).

Netlify turns on HTTPS by itself once the record is visible. That takes from a few minutes up to an hour. If it is still waiting after that, open **Domain management → HTTPS → Verify DNS configuration**.

### 7. Check it

| Open | You should see |
|---|---|
| `https://games.codebread.fun/api/leaderboard` | `{"leaderboard":[]}` |
| `https://games.codebread.fun/` | The game. Enter a name, play a round, your score appears on the board |
| `https://games.codebread.fun/admin` | The admin sign-in. Use your `ADMIN_PASSWORD` |

---

## Part 2: show it in the portfolio

The portfolio is already set up for `https://games.codebread.fun` (in `src/components/sections/GamesSection.tsx`). Once Part 1 works, publish the portfolio the way you always do, for example:

```bash
cd ~/portfolio/MyPortfolio && git add -A && git commit -m "Add Games section with Ninja Rider" && git push origin main
```

What visitors see:

- **Laptop and tablet:** clicking **Play now** loads the game right inside the Games card. There are buttons for **Full screen**, **New tab** and **Close**. The game only loads when someone clicks, so the portfolio stays fast.
- **Phone:** **Play now** opens the game in a new tab, which gives it the whole screen.

The game's start screen has a **← Back to portfolio** link (set in `public/js/config.js`). It is hidden when the game is inside the portfolio, because the visitor is already there.

On the admin page, rounds played from the portfolio show `portfolio.codebread.fun` under **Where players came from**.

### Which sites may show the game

`netlify.toml` lets only `codebread.fun`, any `*.codebread.fun` address and `localhost` (for testing the portfolio on your computer) put the game in an iframe. The admin page cannot be put in an iframe anywhere. To embed the game on another domain, add it to the `frame-ancestors` line in `netlify.toml`.

---

## Troubleshooting

| What you see | Cause and fix |
|---|---|
| `/api/leaderboard` shows a Netlify "Page not found" | The function did not deploy. In the deploy log, the **Functions** step should list `api`. Check that `netlify.toml` and `netlify/functions/api.ts` are committed and **Base directory** is empty. |
| `The database is not connected` | `DATABASE_URL` is missing. Add it (step 3), then redeploy. |
| Admin page says `Admin access is not set up` | Add `ADMIN_PASSWORD` (step 4), then redeploy. |
| The game says it is playing offline | The API is unreachable. Check `/api/leaderboard` first. |
| The portfolio's game box says it refused to connect | The portfolio's address is not in `frame-ancestors` in `netlify.toml`. |
| Browser warns "Not secure" on games.codebread.fun | HTTPS is still being set up. See step 6. |
| Errors from the API | Netlify: game site → **Logs → Functions → api**. |

## What is collected, and removing it

Players see this notice on the start screen: their name, scores and approximate city are saved for the leaderboard and to improve the game. The API stores:

- **Players:** name, first and last seen, device type, approximate location.
- **Rounds:** score, time played, targets, gold, hurdles, orbs, top combo.
- **Feedback:** star rating and optional message.
- **Page visits:** device, browser, approximate location, and the site that linked to the game.

IP addresses are never stored. Location comes from Netlify's own lookup, at city level, so it only appears on the live site, never locally.

On the admin page:

- **Hide** takes a rude name off the public leaderboard.
- **Delete** removes a player and all their data, for example if someone asks.

Rounds that finish faster than real time allows, or score impossibly high, are **flagged**. You can still see them, but they are kept off the leaderboard.

## Running it on your computer

Needs Docker for a throwaway database. Run each of these from `~/projecthub/ohter/horse`. The first line is only needed once; after a restart use `docker start ninja-rider-pg`.

```bash
docker run -d --name ninja-rider-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=ninja -p 127.0.0.1:55432:5432 postgres:17
```

```bash
cp .env.example .env.local
```

Then set `ADMIN_PASSWORD` in `.env.local`, and:

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` serves everything on <http://localhost:3000>, with the admin page at <http://localhost:3000/admin>. API requests go through the same `netlify/functions/api.ts` that Netlify runs. Type-check the API with `npm run typecheck`.

## Updating the game

Edit files in `public/` or `api/`, then commit and push. Netlify redeploys on every push to `main`.
