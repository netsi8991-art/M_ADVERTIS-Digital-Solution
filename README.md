# eFayda ID Card Converter Bot

eFayda PDF ፋይል ወደ printable ID card ምስሎች የሚቀይር Telegram Bot።
Converts Ethiopian eFayda PDF to 4 printable ID card images — **100% FREE**.

## Features
- ✅ Completely free — no payment required
- 📄 Accepts eFayda PDF files
- 🖼 Generates 4 card types: Normal, Mirror, A4 Color, A4 Gray
- ⚙️ Customizable: photo mode (Color/Grey), template (A/B), oval cut
- 🛡️ Rate limiting (3 requests/minute per user)
- 👤 Admin dashboard: /adminstats, /users, /broadcast

## Deploy on Render (Free)

### 1. Get Bot Token
1. Open [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow instructions
3. Copy your token

### 2. Upload to GitHub
1. Create a new repository
2. Upload ALL files directly to root (no subfolders)

### 3. Deploy on Render
1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node bot.js`
   - **Root Directory:** *(leave empty)*
4. Add Environment Variables:
   - `BOT_TOKEN` = your bot token
   - `ADMIN_USERNAME` = your Telegram username (without @)
   - `ADMIN_IDS` = your Telegram numeric ID (optional)
5. Click **Create Web Service**

## Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | ✅ Yes | Telegram bot token from @BotFather |
| `ADMIN_USERNAME` | Optional | Your Telegram username |
| `ADMIN_IDS` | Optional | Your numeric Telegram ID |

## Commands
| Command | Description |
|---------|-------------|
| `/start` | Start bot & configure card settings |
| `/stats` | Your personal usage stats |
| `/help` | Show all commands |
| `/adminstats` | Bot-wide stats (admin only) |
| `/users` | List users (admin only) |
| `/broadcast <msg>` | Message all users (admin only) |
