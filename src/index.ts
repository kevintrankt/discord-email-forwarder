import { Client, GatewayIntentBits, TextChannel, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import * as dotenv from 'dotenv';
import * as readline from 'readline';
import { EmailMonitor } from './emailMonitor';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

let emailMonitor: EmailMonitor;

// Setup readline for debug commands
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

client.once('clientReady', () => {
  console.log(`✅ Discord bot logged in as ${client.user?.tag}`);
  
  // Start email monitoring
  const channelId = process.env.DISCORD_CHANNEL_ID;
  
  if (!channelId) {
    console.error('❌ DISCORD_CHANNEL_ID not found in environment variables');
    process.exit(1);
  }

  emailMonitor = new EmailMonitor({
    user: process.env.EMAIL_USER!,
    password: process.env.EMAIL_PASSWORD!,
    host: process.env.EMAIL_HOST || 'imap.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '993'),
    tls: process.env.EMAIL_TLS !== 'false',
  });

  // Function to check if email contains "going.com"
  const isGoingEmail = (email: any): boolean => {
    const searchTerm = 'going.com';
    
    // Check from address
    if (email.from && email.from.toLowerCase().includes(searchTerm)) {
      return true;
    }
    
    // Check to address
    if (email.to && email.to.toLowerCase().includes(searchTerm)) {
      return true;
    }
    
    // Check subject
    if (email.subject && email.subject.toLowerCase().includes(searchTerm)) {
      return true;
    }
    
    // Check text content
    if (email.text && email.text.toLowerCase().includes(searchTerm)) {
      return true;
    }
    
    // Check HTML content
    if (email.html && email.html.toLowerCase().includes(searchTerm)) {
      return true;
    }
    
    return false;
  };

  // Function to extract "View flight details" link from email
  const extractFlightDetailsLink = (email: any): string | null => {
    const htmlContent = email.html || '';
    const textContent = email.text || '';
    
    // Try to find links in HTML content
    // Pattern 1: <a href="URL">View flight details</a>
    const htmlPattern1 = /<a[^>]+href=["']([^"']+)["'][^>]*>(?:[^<]*View flight details[^<]*)<\/a>/gi;
    let match = htmlPattern1.exec(htmlContent);
    if (match && match[1]) {
      return match[1];
    }
    
    // Pattern 2: <a href="URL">...</a> with "flight" in the text
    const htmlPattern2 = /<a[^>]+href=["']([^"']+)["'][^>]*>(?:[^<]*flight[^<]*details[^<]*)<\/a>/gi;
    match = htmlPattern2.exec(htmlContent);
    if (match && match[1]) {
      return match[1];
    }
    
    // Pattern 3: Look for any link near "View flight details" text
    const pattern3 = /View flight details[^\n]*?(https?:\/\/[^\s<>"]+)/gi;
    match = pattern3.exec(htmlContent + ' ' + textContent);
    if (match && match[1]) {
      return match[1];
    }
    
    // Pattern 4: Find "flight" and "details" near a URL
    const urlPattern = /(https?:\/\/[^\s<>"]+)/g;
    const urls = htmlContent.match(urlPattern) || [];
    
    // Check if any URL is near flight-related text
    for (const url of urls) {
      const index = htmlContent.indexOf(url);
      const surrounding = htmlContent.substring(Math.max(0, index - 200), index + 200).toLowerCase();
      if (surrounding.includes('flight') && surrounding.includes('details')) {
        return url;
      }
    }
    
    return null;
  };

  // Function to send email to Discord
  const sendEmailToDiscord = async (email: any) => {
    // Filter: only process emails containing "going.com"
    if (!isGoingEmail(email)) {
      console.log(`⏭️ Skipping email (not from going.com): ${email.subject}`);
      return;
    }
    
    try {
      const channel = await client.channels.fetch(channelId) as TextChannel;
      
      if (!channel || !channel.isTextBased()) {
        console.error('❌ Channel not found or is not a text channel');
        return;
      }

      // Extract image attachments
      const imageAttachments: any[] = [];
      
      if (email.attachments && email.attachments.length > 0) {
        email.attachments.forEach(att => {
          const isImage = att.contentType?.startsWith('image/');
          if (isImage && att.content) {
            imageAttachments.push(att);
          }
        });
      }

      // Create Discord attachments from images
      const discordAttachments: AttachmentBuilder[] = [];
      
      if (imageAttachments.length > 0) {
        imageAttachments.forEach((att, index) => {
          try {
            const attachment = new AttachmentBuilder(att.content, {
              name: att.filename || `image_${index}.png`,
            });
            discordAttachments.push(attachment);
          } catch (err) {
            console.error(`⚠️ Failed to attach image: ${att.filename}`, err);
          }
        });
      }

      // Extract flight details link if present
      const flightDetailsLink = extractFlightDetailsLink(email);
      
      // Create a simple, nicely formatted embed with just the subject
      let description = `**${email.subject}**`;
      
      // Add flight details link if found
      if (flightDetailsLink) {
        description += `\n\n[View flight details](${flightDetailsLink})`;
        console.log(`🔗 Found flight details link: ${flightDetailsLink}`);
      }
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2) // Discord blurple color
        .setDescription(description)
        .setTimestamp();

      // Set first image as the main embed image if available
      if (discordAttachments.length > 0) {
        embed.setImage(`attachment://${imageAttachments[0].filename || 'image_0.png'}`);
      }

      // Send message with embed and images
      await channel.send({ 
        embeds: [embed],
        files: discordAttachments
      });
      
      console.log(`✅ Forwarded email: ${email.subject} (${imageAttachments.length} image(s))`);
    } catch (error) {
      console.error('❌ Error sending email to Discord:', error);
    }
  };

  emailMonitor.on('newEmail', sendEmailToDiscord);

  // Debug command: type "test" to process latest email
  emailMonitor.on('latestEmail', sendEmailToDiscord);

  rl.on('line', (input) => {
    const command = input.trim().toLowerCase();
    if (command === 'test') {
      console.log('🧪 Testing with latest email...');
      emailMonitor.getLatestEmail();
    }
  });

  emailMonitor.on('error', (error) => {
    console.error('❌ Email monitor error:', error);
  });

  emailMonitor.start();
  console.log('🔍 Email monitoring started');
  console.log('💡 Type "test" to process the latest email for debugging');
});

client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  if (emailMonitor) {
    emailMonitor.stop();
  }
  rl.close();
  client.destroy();
  process.exit(0);
});

// Login to Discord
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('❌ DISCORD_BOT_TOKEN not found in environment variables');
  process.exit(1);
}

client.login(token).catch((error) => {
  console.error('❌ Failed to login to Discord:', error);
  process.exit(1);
});
