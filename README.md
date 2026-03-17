# Madness Pool — March Madness ATS Pick'em

## Quick Deploy to Vercel

### Prerequisites
- Node.js 18+ installed
- A Vercel account (vercel.com)
- Git installed

### Step-by-step

1. **Create a GitHub repo**
   - Go to github.com/new
   - Name it `madness-pool`
   - Make it private
   - Don't initialize with README (we have one)

2. **Push this code to GitHub**
   ```bash
   cd madness-pool
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/madness-pool.git
   git push -u origin main
   ```

3. **Deploy on Vercel**
   - Go to vercel.com/new
   - Import your `madness-pool` repo
   - Vercel will auto-detect Vite — just click Deploy
   - Wait for build to complete

4. **Add Vercel KV (Redis database)**
   - In your Vercel project dashboard, go to **Storage** tab
   - Click **Create Database** → select **KV (Redis)**
   - Name it `madness-pool-kv`
   - Click **Create**
   - It will auto-connect environment variables to your project

5. **Redeploy**
   - After adding KV, go to **Deployments** tab
   - Click the three dots on latest deployment → **Redeploy**
   - This picks up the new KV environment variables

6. **You're live!**
   - Your site is now at `madness-pool.vercel.app` (or your custom domain)
   - Log in as `commissioner` with any password to set up games
   - Share the URL with your pool members

### Custom Domain (optional)
- In Vercel project → Settings → Domains
- Add your custom domain and follow DNS instructions

### How the data works
- All data stored in Vercel KV (Redis)
- Shared across all users in real-time
- Persists between sessions
- Free tier supports up to 30,000 requests/month (plenty for a 20-person pool)
