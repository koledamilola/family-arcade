# 🕹️ Family Arcade

A private, family-only website where everyone can sign in and play the games the kids make.

- 🎮 Upload games as one **HTML file**, a **zip folder** (Phaser, Godot, Unity WebGL, Construct…), or a **web link**
- 🔐 Sign in with **Google**, **email + password**, or a **kid username + PIN**
- ✅ New sign-ups wait for an **admin to approve** them
- 🛠️ **Admin area** to add, edit, hide and delete games, approve people, create kid accounts and choose who is admin (there can be several admins)
- 🏆 Leaderboards, 💖 likes, ⭐ favorites, 🔥 play counts, categories and search
- 📱 Works on phones and tablets, supports fullscreen and game controllers
- 🛡️ Every game runs in a locked-down sandbox, so a game can never see anyone's login

Built with **Next.js** (hosted on **Vercel**) and **Supabase** (sign-in, database, file storage). All of them have free plans that are plenty for a family.

---

## 🚀 Setup (about 20 minutes, one time)

### 1. Create the Supabase project
1. Go to <https://supabase.com/dashboard> → **New project**. Pick any name and a strong database password, and choose the region nearest you.
2. When it's ready, open **SQL Editor** → **New query**. Paste in everything from [`supabase/schema.sql`](supabase/schema.sql), then click **Run**. This creates the tables, the security rules and the file storage.
3. Open **Project Settings → API Keys** and copy:
   - the **Project URL** (also shown under *Data API*)
   - the **Publishable key** (`sb_publishable_…`)
   - the **Secret key** (`sb_secret_…`). Keep this one private!

   (Older projects call these the `anon` key and the `service_role` key. Those work too.)

### 2. Run it on your computer
1. In this folder, copy `.env.example` to a new file called `.env.local` and paste in the three values.
2. Run:
   ```bash
   npm install
   npm run dev
   ```
3. Open <http://localhost:3000>.

### 3. Make yourself the first admin
1. On the site, click **Create account** (under "or use email") and sign up with your email. (Confirm the email if Supabase sends you a link.)
2. Choose **Start a family**. You become that family's **parent**: you add kid accounts, invite other grown-ups with a code, and approve the games kids make.
3. To manage *every* family on the site, make yourself the platform admin in Supabase **SQL Editor**:
   ```sql
   update public.profiles set is_platform_admin = true where email = 'you@example.com';
   ```
   Refresh, and you'll see the **Platform** button.

> Upgrading from the single-family version? Run [`supabase/migrations/20261119000000_families.sql`](supabase/migrations/20261119000000_families.sql) once, then `supabase/schema.sql`.

### 4. Turn on Google sign-in (optional but recommended)
1. Go to <https://console.cloud.google.com/> → create a project → **APIs & Services → OAuth consent screen**. Choose **External**, fill in the app name and your email, and save.
2. **Credentials → Create credentials → OAuth client ID** → *Web application*.
   - **Authorized redirect URI:** copy it from Supabase **Authentication → Sign In / Providers → Google** (it looks like `https://<project>.supabase.co/auth/v1/callback`).
3. Paste the Google **Client ID** and **Client secret** into that Supabase Google provider page and turn it **on**.

### 5. Tell Supabase your site's address
In Supabase **Authentication → URL Configuration**:
- **Site URL:** your Vercel address (e.g. `https://family-arcade.vercel.app`), or `http://localhost:3000` while testing
- **Redirect URLs:** add both `http://localhost:3000/**` and `https://your-site.vercel.app/**`

### 6. Put it online with Vercel
1. Push this folder to a new **private** GitHub repository:
   ```bash
   git add -A
   git commit -m "Family Arcade"
   git branch -M main
   git remote add origin https://github.com/<you>/family-arcade.git
   git push -u origin main
   ```
2. In Vercel: **Add New → Project** → import the repo.
3. Under **Environment Variables**, add the same three values from `.env.local`. Then click **Deploy**.
4. Go back to step 5 and add your new `*.vercel.app` address in Supabase.

> 💡 Want your own domain like `smithgames.com`? Add it in Vercel → Project → **Domains**, then update the Supabase URLs in step 5.

---

## 👨‍👩‍👧 Everyday use

| I want to… | Go to |
| --- | --- |
| Add a game | **Admin → Games → Add a game** |
| Hide a game while testing | Edit the game → turn off **Show on the arcade**, or press **Hide** |
| Let someone in | **Admin → People → Waiting for approval → Approve** |
| Make a kid account | **Admin → People → Add a kid** (choose a username and a 4-8 digit PIN) |
| Reset a kid's PIN | **Admin → People →** the kid's **PIN** button |
| Make someone an admin | **Admin → People →** change their role to **Admin** |
| Wipe a leaderboard | Edit the game → **Clear leaderboard** |

To try uploads, add [`examples/star-catcher.html`](examples/star-catcher.html) as an **HTML file** game and switch on **leaderboard**.

**For the kids:** give them [`docs/GAME-MAKER-GUIDE.md`](docs/GAME-MAKER-GUIDE.md). It has a paste-in prompt for vibecoding tools so their games fit the arcade, plus the one line they need for leaderboards.

---

## 🛡️ How games are kept safe

- Uploaded game pages are served from `/g/…` with a strict **sandbox** (no access to the site's cookies, login or storage). This holds even if someone opens the game file directly.
- Games can still save progress: `localStorage` is swapped for a stand-in that the arcade keeps per game, per player, in that browser.
- Other game files (images, sounds, code) are served straight from Supabase Storage. Their folder names are random and can't be guessed, but anyone who has the exact link to a file could open it.
- Only admins can upload. Uploads go straight from the browser to Supabase with one-time upload links that the server creates after checking you're an admin.
- Database security rules (Row Level Security) mean only approved players can see games, scores and likes.

## 📁 Project map

```
src/app/login            sign-in page (Google, email, kid PIN)
src/app/(arcade)         the arcade: home, play page, admin area
src/app/g/[prefix]/...   serves uploaded game files safely
src/lib/game-shim.ts     helper injected into games (saves + FamilyArcade.submitScore)
supabase/schema.sql      database tables, security rules, storage buckets
```
