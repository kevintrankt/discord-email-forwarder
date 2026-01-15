import { EventEmitter } from 'events';
import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';

export interface EmailConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}

export class EmailMonitor extends EventEmitter {
  private imap: Imap;
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private processedEmails: Set<string> = new Set();

  constructor(private config: EmailConfig) {
    super();
    
    this.imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false },
    });

    this.setupImapListeners();
  }

  private setupImapListeners(): void {
    this.imap.once('ready', () => {
      console.log('✅ Connected to email server');
      this.openInbox();
    });

    this.imap.once('error', (err: Error) => {
      console.error('❌ IMAP connection error:', err);
      this.emit('error', err);
      
      // Attempt to reconnect after 30 seconds
      if (this.isRunning) {
        console.log('🔄 Attempting to reconnect in 30 seconds...');
        setTimeout(() => {
          if (this.isRunning) {
            this.connect();
          }
        }, 30000);
      }
    });

    this.imap.once('end', () => {
      console.log('📪 IMAP connection ended');
    });
  }

  private connect(): void {
    try {
      this.imap.connect();
    } catch (error) {
      console.error('❌ Failed to connect to email server:', error);
      this.emit('error', error);
    }
  }

  private openInbox(): void {
    this.imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        console.error('❌ Error opening inbox:', err);
        this.emit('error', err);
        return;
      }
      
      console.log(`📬 Inbox opened (${box.messages.total} total messages)`);
      this.checkForNewEmails();
    });
  }

  private checkForNewEmails(): void {
    if (!this.isRunning) return;

    // Search for unseen emails
    this.imap.search(['UNSEEN'], (err, results) => {
      if (err) {
        console.error('❌ Error searching for emails:', err);
        this.emit('error', err);
        return;
      }

      if (results.length === 0) {
        console.log('📭 No new emails');
        this.scheduleNextCheck();
        return;
      }

      console.log(`📬 Found ${results.length} new email(s)`);
      
      const fetch = this.imap.fetch(results, {
        bodies: '',
        markSeen: true,
      });

      fetch.on('message', (msg, seqno) => {
        msg.on('body', (stream) => {
          simpleParser(stream, (err, parsed) => {
            if (err) {
              console.error('❌ Error parsing email:', err);
              return;
            }

            // Use message-id as unique identifier
            const messageId = parsed.messageId || `${seqno}-${Date.now()}`;
            
            if (!this.processedEmails.has(messageId)) {
              this.processedEmails.add(messageId);
              this.emit('newEmail', this.formatEmail(parsed));
            }
          });
        });

        msg.once('error', (err) => {
          console.error('❌ Error fetching message:', err);
        });
      });

      fetch.once('error', (err) => {
        console.error('❌ Fetch error:', err);
        this.emit('error', err);
      });

      fetch.once('end', () => {
        console.log('✅ Finished processing new emails');
        this.scheduleNextCheck();
      });
    });
  }

  private scheduleNextCheck(): void {
    if (!this.isRunning) return;

    // Check for new emails every 60 seconds by default
    const interval = parseInt(process.env.EMAIL_CHECK_INTERVAL || '60000');
    
    this.checkInterval = setTimeout(() => {
      this.checkForNewEmails();
    }, interval);
  }

  private formatEmail(parsed: ParsedMail) {
    return {
      subject: parsed.subject || '(No Subject)',
      from: this.formatAddress(parsed.from),
      to: this.formatAddress(parsed.to),
      date: parsed.date,
      text: parsed.text || parsed.html || '(No content)',
      html: parsed.html,
      attachments: parsed.attachments.map(att => ({
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        content: att.content, // Include the actual attachment data
      })),
      messageId: parsed.messageId,
    };
  }

  private formatAddress(address: any): string {
    if (!address) return 'Unknown';
    
    if (Array.isArray(address)) {
      return address.map(addr => addr.text || addr.address).join(', ');
    }
    
    return address.text || address.address || 'Unknown';
  }

  public start(): void {
    if (this.isRunning) {
      console.log('⚠️ Email monitor is already running');
      return;
    }

    this.isRunning = true;
    this.connect();
  }

  public getLatestEmail(): void {
    if (!this.isRunning) {
      console.error('❌ Email monitor is not running');
      return;
    }

    // Fetch the most recent email
    this.imap.search(['ALL'], (err, results) => {
      if (err) {
        console.error('❌ Error searching for emails:', err);
        return;
      }

      if (results.length === 0) {
        console.log('📭 No emails found in inbox');
        return;
      }

      // Get the last email (most recent)
      const latestSeqno = results[results.length - 1];
      console.log(`📬 Fetching latest email (seqno: ${latestSeqno})...`);

      const fetch = this.imap.fetch([latestSeqno], {
        bodies: '',
        markSeen: false, // Don't mark as seen for testing
      });

      fetch.on('message', (msg) => {
        msg.on('body', (stream) => {
          simpleParser(stream, (err, parsed) => {
            if (err) {
              console.error('❌ Error parsing email:', err);
              return;
            }

            console.log(`📧 Latest email: ${parsed.subject}`);
            this.emit('latestEmail', this.formatEmail(parsed));
          });
        });
      });

      fetch.once('error', (err) => {
        console.error('❌ Fetch error:', err);
      });
    });
  }

  public stop(): void {
    if (!this.isRunning) return;

    console.log('🛑 Stopping email monitor...');
    this.isRunning = false;

    if (this.checkInterval) {
      clearTimeout(this.checkInterval);
      this.checkInterval = null;
    }

    this.imap.end();
    this.processedEmails.clear();
  }
}
