# Deferred Setup

Configuration required for external services before full functionality.

---

## 1. Clerk (Authentication) ⭐ Primary Auth

Clerk handles all user authentication. No passwords stored in our database.

### Create Clerk Application

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com)
2. Click **Create application**
3. Select authentication methods (Email, Google, etc.)

### Enable Twitch Social Connection

1. In Clerk Dashboard → **User & Authentication** → **Social Connections**
2. Enable **Twitch**
3. Create Twitch app at [dev.twitch.tv/console](https://dev.twitch.tv/console):
   - **OAuth Redirect URLs**: `https://clerk.your-domain.com/v1/oauth_callback` (from Clerk dashboard)
   - Copy Client ID and Secret to Clerk

### Environment Variables

**Frontend (`apps/web/.env.local`)** - Publishable key only:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

**Backend (`services/api/.env`)** - Secret key only:

```bash
CLERK_SECRET_KEY=sk_test_...
```

> ⚠️ **NEVER put CLERK_SECRET_KEY in frontend code**

---

## 2. Platform Integrations (OAuth)

You must create applications on each platform to enable "Connect Account" functionality.

### Twitch (Streaming Integration)

1. Go to [dev.twitch.tv/console](https://dev.twitch.tv/console)
2. **OAuth Redirect URLs**: `http://localhost:3001/api/auth/callback/twitch`

```bash
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
TWITCH_REDIRECT_URI=http://localhost:3001/api/auth/callback/twitch
```

### YouTube (Shorts & Streaming)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create Project -> APIs & Services -> Enable **YouTube Data API v3**
3. Credentials -> Create OAuth Client ID (Web Application)
4. **Authorized Redirect URIs**: `http://localhost:3001/api/auth/callback/youtube`

```bash
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REDIRECT_URI=http://localhost:3001/api/auth/callback/youtube
```

### Instagram & Threads (Meta) 📸

> **Prerequisites:**
>
> - An **Instagram Business or Creator account** (not personal)
> - The Instagram account must be **public**
> - Recommended: Link your Instagram to a **Facebook Page**

#### Step 1: Create Meta Developer Account

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Click **Get Started** in the top right
3. Log in with your Facebook account
4. Accept the Meta Platform Terms
5. Verify your account (phone number or email)

#### Step 2: Create a New App

1. Go to **My Apps** → **Create App**
2. Select **"Other"** as the use case → Click **Next**
3. Select **"Business"** as the app type → Click **Next**
4. Fill in:
   - **App Name**: `ViralCue` (or your app name)
   - **App Contact Email**: Your email
   - **Business Portfolio**: Select or create one
5. Click **Create App**

#### Step 3: Add Instagram Graph API Product

1. From your App Dashboard, scroll to **"Add products to your app"**
2. Find **"Instagram Graph API"** → Click **Set up**
3. Also add **"Facebook Login for Business"** (required for OAuth)

#### Step 4: Configure Facebook Login

1. In the left sidebar, go to **Facebook Login for Business** → **Settings**
2. Add to **Valid OAuth Redirect URIs**:
   ```
   http://localhost:3001/api/auth/callback/instagram
   https://yourdomain.com/api/auth/callback/instagram
   ```
3. Click **Save Changes**

#### Step 5: Get Your App Credentials

1. Go to **App Settings** → **Basic** (in left sidebar)
2. Copy:
   - **App ID** → This is your `META_CLIENT_ID`
   - **App Secret** → Click "Show" → This is your `META_CLIENT_SECRET`

#### Step 6: Add Instagram Test Users (Development Mode)

While your app is in Development Mode, you must add test users:

1. Go to **App Roles** → **Roles**
2. Click **Add People** → Enter Instagram username
3. The user must accept the invitation from their Instagram app
4. Alternatively, go to **Instagram Graph API** → **Instagram Testers** → Add your account

#### Step 7: Request Permissions (For Production)

For publishing content, you need these permissions approved:

- `instagram_business_basic` - Read profile info
- `instagram_business_content_publish` - Post content
- `pages_read_engagement` - Read linked Facebook Page

> ⚠️ **App Review Required**: Before going live, submit your app for Meta App Review. You'll need:
>
> - A Privacy Policy URL
> - Detailed use case explanation
> - Screen recording showing how you use the API

#### Environment Variables

```bash
META_CLIENT_ID=...        # App ID from Step 5
META_CLIENT_SECRET=...    # App Secret from Step 5
INSTAGRAM_REDIRECT_URI=http://localhost:3001/api/auth/callback/instagram
```

#### Rate Limits

- **100 posts per 24 hours** per Instagram account
- Carousel posts count as 1 post
- Reels have specific format requirements (9:16, < 90 seconds)

### TikTok

1. Go to [developers.tiktok.com](https://developers.tiktok.com)
2. Create App -> Production
3. Products: **Login Kit**, **Content Posting API**
4. **Redirect URI**: `http://localhost:3001/api/auth/callback/tiktok`

```bash
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=http://localhost:3001/api/auth/callback/tiktok
```

### X (Twitter)

1. Go to [developer.twitter.com](https://developer.twitter.com)
2. Create App (Free/Basic/Pro)
3. User Authentication Settings: **OAuth 2.0** (Type: Web App)
4. **Callback URI**: `http://localhost:3001/api/auth/callback/twitter`
5. Permissions: **Read and Write**

```bash
TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...
TWITTER_REDIRECT_URI=http://localhost:3001/api/auth/callback/twitter
```

---

## 3. Deepgram (Speech-to-Text)

1. Sign up at [deepgram.com](https://deepgram.com)
2. Create a project and generate API key

```bash
DEEPGRAM_API_KEY=your_deepgram_api_key
```

---

## 4. Google Cloud (Pub/Sub & Storage)

Required for production backend.

```bash
GOOGLE_CLOUD_PROJECT=viralcue-prod
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

---

## 5. Stripe (Payments)

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```
