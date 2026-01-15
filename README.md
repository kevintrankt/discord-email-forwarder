# Discord Email Forwarder Bot

A Discord bot that monitors an email inbox (via IMAP) and forwards all new emails to a specified Discord channel.

## Features

- 📧 Monitors email inbox in real-time using IMAP
- 🤖 Forwards emails to Discord with the subject line
- 📸 **Generates and posts a visual screenshot of the email** (exactly how it looks!)
- 🎨 Beautiful email rendering with proper formatting
- 🔄 Auto-reconnects on connection loss
- ⚙️ Configurable check intervals
- 🔒 Secure credential management with `.env`

## Prerequisites

- Node.js 18+ and npm
- A Discord bot token
- Email account with IMAP access enabled

## Setup Instructions

### 1. Clone or Download the Project

```bash
cd discord-email-forwarder
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create a Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section
4. Click "Add Bot"
5. Under the bot's username, click "Reset Token" to get your bot token (save this!)
6. Enable these Privileged Gateway Intents:
   - Server Members Intent (optional)
   - Message Content Intent (optional)
7. Go to "OAuth2" > "URL Generator"
8. Select scopes: `bot`
9. Select bot permissions: `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`
10. Copy the generated URL and open it in a browser to invite the bot to your server

### 4. Get Your Discord Channel ID

1. Enable Developer Mode in Discord (Settings > Advanced > Developer Mode)
2. Right-click on the channel where you want emails forwarded
3. Click "Copy ID"

### 5. Setup Email Configuration

#### For Gmail:
1. Enable IMAP in Gmail settings (Settings > Forwarding and POP/IMAP)
2. Create an [App Password](https://myaccount.google.com/apppasswords):
   - Go to your Google Account
   - Select Security > 2-Step Verification
   - At the bottom, select App passwords
   - Generate a new app password for "Mail"
   - Use this password (not your regular Gmail password)

#### For Other Email Providers:
- Find your provider's IMAP settings (host, port)
- Ensure IMAP is enabled in your email account settings

### 6. Configure Environment Variables

Create a `.env` file in the project root:

```env
# Discord Bot Configuration
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CHANNEL_ID=your_discord_channel_id_here

# Email Configuration (IMAP)
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password_here
EMAIL_HOST=imap.gmail.com
EMAIL_PORT=993
EMAIL_TLS=true

# Optional: Check interval in milliseconds (default: 60000 = 1 minute)
# EMAIL_CHECK_INTERVAL=60000
```

**Common IMAP Settings:**
- **Gmail**: `imap.gmail.com`, port `993`, TLS enabled
- **Outlook/Hotmail**: `outlook.office365.com`, port `993`, TLS enabled
- **Yahoo**: `imap.mail.yahoo.com`, port `993`, TLS enabled
- **iCloud**: `imap.mail.me.com`, port `993`, TLS enabled

## Running the Bot

### Development Mode (with auto-reload)

```bash
npm run dev
```

### Production Mode

```bash
# Build the TypeScript code
npm run build

# Start the bot
npm start
```

### Running in Background (Production)

Using PM2 (recommended):

```bash
# Install PM2 globally
npm install -g pm2

# Start the bot
pm2 start npm --name "discord-email-bot" -- start

# View logs
pm2 logs discord-email-bot

# Stop the bot
pm2 stop discord-email-bot

# Restart the bot
pm2 restart discord-email-bot
```

## How It Works

1. The bot connects to Discord using the provided token
2. It establishes an IMAP connection to your email server
3. Launches a headless browser for email rendering
4. Every minute (configurable), it checks for new unread emails
5. When a new email is found:
   - The email is parsed to extract subject, sender, content, and HTML
   - The email is rendered in a headless browser with beautiful formatting
   - A screenshot is taken of the rendered email
   - The subject line and screenshot are posted to Discord
   - The email is marked as read to avoid duplicate processing

## Troubleshooting

### Bot doesn't connect to Discord
- Verify your `DISCORD_BOT_TOKEN` is correct
- Check that the bot has been invited to your server
- Ensure the bot has permission to send messages in the channel

### Email connection fails
- **Gmail**: Make sure you're using an App Password, not your regular password
- **Two-Factor Authentication**: You must use an app-specific password
- **Less Secure Apps**: Some providers may require enabling "less secure app access"
- Verify IMAP is enabled in your email settings
- Check your `EMAIL_HOST`, `EMAIL_PORT`, and credentials are correct
- Try disabling TLS temporarily: `EMAIL_TLS=false`

### Emails not appearing in Discord
- Check the bot logs for errors
- Verify `DISCORD_CHANNEL_ID` is correct
- Ensure the bot has permission to send messages and embeds in the channel
- Check if emails are being marked as read (they won't be forwarded twice)

### Rate Limiting
- If you receive many emails, Discord may rate limit the bot
- Consider adding delays between messages if needed
- The bot handles this gracefully by logging errors

## Security Notes

- **Never commit your `.env` file** - it contains sensitive credentials
- Use app-specific passwords when possible (especially for Gmail)
- Keep your bot token secure - anyone with it can control your bot
- Consider restricting the bot's permissions to only what's needed

## Customization

### Changing Check Interval

Edit the `EMAIL_CHECK_INTERVAL` in your `.env` file (value in milliseconds):

```env
EMAIL_CHECK_INTERVAL=30000  # Check every 30 seconds
```

### Modifying Email Embed Format

Edit the embed creation in `src/index.ts`:

```typescript
const embed = new EmbedBuilder()
  .setColor(0x0099FF)  // Change color
  .setTitle(`📧 New Email: ${email.subject}`)
  // Add or remove fields as needed
```

### Filtering Emails

You can modify `src/emailMonitor.ts` to search for specific emails:

```typescript
// Instead of ['UNSEEN'], use:
this.imap.search(['UNSEEN', ['FROM', 'specific@email.com']], ...)
// Or search by subject:
this.imap.search(['UNSEEN', ['SUBJECT', 'Important']], ...)
```

## Contributing

Feel free to submit issues or pull requests for improvements!

## License

MIT License - feel free to use this project however you'd like.
