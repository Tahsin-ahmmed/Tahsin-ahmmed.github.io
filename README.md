# Tahsin Ahmmed — Portfolio

A fast, mobile-friendly portfolio with a built-in admin portal. No build step, no database and no monthly cost.

- **Website:** `index.html`. Everything on it comes from `data/content.json`.
- **Admin portal:** `/admin/`. Edit every section, upload images and your CV, preview live, then press **Publish**.
- **How publishing works:** the admin commits your changes straight to your GitHub repo. Your free host sees the commit and redeploys within 1–2 minutes.

```
index.html            public site
assets/css/style.css  site styles (light + dark)
assets/js/site.js     renders content.json
assets/js/icons.js    icon set (shared with admin)
data/content.json     ALL your content
uploads/              images, CV, favicon
admin/                admin portal (config.js = your repo name)
```

---

## 1. Put the project on GitHub (one time)

1. Create a free account at <https://github.com> (you already have `Tahsin-ahmmed`).
2. Create a **new public repository** named `portfolio`. Don't add a README.
3. In this folder, run:

```bash
git init
git add .
git commit -m "Portfolio site with admin"
git branch -M main
git remote add origin https://github.com/Tahsin-ahmmed/Tahsin-ahmmed.github.io.git
git push -u origin main
```

If you pick a different repo name, update `repo:` in `admin/config.js`.

## 2. Deploy for free (pick ONE)

### Option A: GitHub Pages (simplest, no extra account)
1. Repo → **Settings → Pages**.
2. Source: **Deploy from a branch** → Branch `main`, folder `/ (root)` → Save.
3. After about a minute your site is live at `https://tahsin-ahmmed.github.io/`.
   - Tip: name the repo `Tahsin-ahmmed.github.io` to get the shorter `https://tahsin-ahmmed.github.io/`. Update `admin/config.js` to match.

### Option B: Netlify (keep `tahsinahmmed.netlify.app`)
1. Netlify → your existing site → **Site configuration → Build & deploy → Link repository** (or **Add new site → Import from Git**) → pick the repo.
2. Build command: *(leave empty)*. Publish directory: `.`
3. Every Publish from the admin triggers a quick deploy.
   - Accounts created after Sept 2025 are on Netlify's credit-based free plan, which limits deploys per month. If you hit that limit, use Option A or C.

### Option C: Cloudflare Pages
Workers & Pages → Create → Pages → Connect to Git → pick the repo. Framework preset: **None**. Build command: empty. Output directory: `/`.

## 3. Create your admin token (one time)

1. Open <https://github.com/settings/personal-access-tokens/new>.
2. **Repository access:** Only select repositories → `portfolio`.
3. **Permissions → Repository permissions → Contents: Read and write.**
4. Choose an expiry (e.g. 1 year), generate, and copy the token.

## 4. Use the admin

1. Go to `https://<your-site>/admin/`.
2. **First time only:** paste the token and sign in. The admin then asks you to choose a **username and password**.
3. **From then on, on any device:** sign in with that username and password. You won't need the token again.
   - How it works: your token is encrypted with your password and saved as `admin/auth.json`. The password itself is never stored, so use a strong one (10+ characters, not reused from another site).
   - Forgot the password, or the token expired? Click **Sign in with a GitHub token instead**, then choose a new username and password from the ☰ menu (**Username & password…**).
3. Edit any section. Use **Upload image** for photos (they are resized and converted to WebP automatically) and **Upload file** for your CV PDF.
4. Click **Preview** to see changes live on desktop or mobile.
5. Click **Publish**. The live site updates in 1–2 minutes.

Other tools in the ☰ menu: **Download backup**, **Import JSON**, **Discard changes & reload**, **Sign out**.
Show or hide whole sections (e.g. References) under **Settings → Visible sections**.

> Security: the admin page is public, but it does nothing without your token. The token is stored only in your browser and only works on this one repo. If a device is lost, delete the token on GitHub and create a new one.

## Contact form
The form posts to your Formspree endpoint (`contact.formEndpoint`, free tier = 50 submissions per month). To use a different one, sign up at <https://formspree.io>, create a form and paste its URL in **Admin → Contact**. If the field is empty, the form opens the visitor's email app instead.

## Run locally
The site loads JSON, so opening `index.html` by double-clicking won't work. Start a tiny server instead:

```bash
python -m http.server 8000
# open http://localhost:8000  and  http://localhost:8000/admin/
```
(The admin still saves to GitHub, even when you run it locally.)
