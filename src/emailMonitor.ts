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
  private imap: Imap | null = null;
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private processedEmails: Set<string> = new Set();

  constructor(private config: EmailConfig) {
    super();
  }

  private createImap(): Imap {
    return new Imap({
      user: this.config.user,
      password: this.config.password,
      host: this.config.host,
      port: this.config.port,
      tls: this.config.tls,
      tlsOptions: { rejectUnauthorized: false },
    });
  }

  private connectAndRun(
    mode: 'poll' | 'latest',
    onReady: (imap: Imap) => void
  ): void {
    if (!this.isRunning) return;

    if (this.imap) {
      console.log('⚠️ IMAP connection already active');
      return;
    }

    const imap = this.createImap();
    this.imap = imap;

    imap.once('ready', () => {
      console.log('✅ Connected to email server');
      onReady(imap);
    });

    imap.once('error', (err: Error) => {
      console.error('❌ IMAP connection error:', err);
      this.emit('error', err);
      this.finishConnection(mode, true);

      // Attempt to reconnect after 30 seconds
      if (this.isRunning && mode === 'poll') {
        console.log('🔄 Attempting to reconnect in 30 seconds...');
        setTimeout(() => {
          if (this.isRunning && !this.imap) {
            this.connectAndRun('poll', (imapInstance) => {
              this.openInbox(imapInstance, 'poll');
            });
          }
        }, 30000);
      }
    });

    imap.once('end', () => {
      console.log('📪 IMAP connection ended');
      this.imap = null;
    });

    try {
      imap.connect();
    } catch (error) {
      console.error('❌ Failed to connect to email server:', error);
      this.emit('error', error);
      this.finishConnection(mode, true);
    }
  }

  private openInbox(imap: Imap, mode: 'poll' | 'latest'): void {
    imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        console.error('❌ Error opening inbox:', err);
        this.emit('error', err);
        this.finishConnection(mode, true);
        return;
      }

      console.log(`📬 Inbox opened (${box.messages.total} total messages)`);
      if (mode === 'poll') {
        this.checkForNewEmails(imap);
      } else {
        this.getLatestEmailFromImap(imap);
      }
    });
  }

  private checkForNewEmails(imap: Imap): void {
    if (!this.isRunning) return;

    // Search for unseen emails
    imap.search(['UNSEEN'], (err, results) => {
      if (err) {
        console.error('❌ Error searching for emails:', err);
        this.emit('error', err);
        this.finishConnection('poll', true);
        return;
      }

      if (results.length === 0) {
        console.log('📭 No new emails');
        this.finishConnection('poll', false);
        return;
      }

      console.log(`📬 Found ${results.length} new email(s)`);

      const fetch = imap.fetch(results, {
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
        this.finishConnection('poll', true);
      });

      fetch.once('end', () => {
        console.log('✅ Finished processing new emails');
        this.finishConnection('poll', false);
      });
    });
  }

  private getLatestEmailFromImap(imap: Imap): void {
    if (!this.isRunning) return;

    imap.search(['ALL'], (err, results) => {
      if (err) {
        console.error('❌ Error searching for emails:', err);
        this.finishConnection('latest', true);
        return;
      }

      if (results.length === 0) {
        console.log('📭 No emails found in inbox');
        this.finishConnection('latest', false);
        return;
      }

      const latestSeqno = results[results.length - 1];
      console.log(`📬 Fetching latest email (seqno: ${latestSeqno})...`);

      const fetch = imap.fetch([latestSeqno], {
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
        this.finishConnection('latest', true);
      });

      fetch.once('end', () => {
        this.finishConnection('latest', false);
      });
    });
  }

  private scheduleNextCheck(): void {
    if (!this.isRunning) return;

    // Check for new emails every 60 minutes by default
    const interval = parseInt(process.env.EMAIL_CHECK_INTERVAL || '3600000');

    this.checkInterval = setTimeout(() => {
      this.connectAndRun('poll', (imapInstance) => {
        this.openInbox(imapInstance, 'poll');
      });
    }, interval);
  }

  private finishConnection(mode: 'poll' | 'latest', isError: boolean): void {
    if (!this.imap) {
      if (mode === 'poll' && !isError) {
        this.scheduleNextCheck();
      }
      return;
    }

    try {
      this.imap.removeAllListeners();
      this.imap.end();
    } catch (error) {
      console.warn('⚠️ Error closing IMAP connection:', error);
    } finally {
      this.imap = null;
    }

    if (mode === 'poll' && !isError) {
      this.scheduleNextCheck();
    }
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
    this.connectAndRun('poll', (imapInstance) => {
      this.openInbox(imapInstance, 'poll');
    });
  }

  public getLatestEmail(): void {
    if (!this.isRunning) {
      console.error('❌ Email monitor is not running');
      return;
    }

    this.connectAndRun('latest', (imapInstance) => {
      this.openInbox(imapInstance, 'latest');
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

    if (this.imap) {
      this.imap.removeAllListeners();
      this.imap.end();
      this.imap = null;
    }
    this.processedEmails.clear();
  }
}
