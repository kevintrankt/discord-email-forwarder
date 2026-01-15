import puppeteer, { Browser } from 'puppeteer';

export class EmailRenderer {
  private browser: Browser | null = null;

  async initialize(): Promise<void> {
    if (!this.browser) {
      console.log('🌐 Launching browser for email rendering...');
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
      });
      console.log('✅ Browser ready');
    }
  }

  async renderEmailToImage(email: {
    subject: string;
    from: string;
    to: string;
    date?: Date;
    text?: string;
    html?: string;
  }): Promise<Buffer> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();
    
    try {
      // Set viewport for consistent screenshots
      await page.setViewport({
        width: 800,
        height: 1200,
        deviceScaleFactor: 2, // Higher quality
      });

      // Create HTML for the email
      const emailHtml = this.createEmailHtml(email);
      
      await page.setContent(emailHtml, {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      // Wait a bit for any fonts/styles to load
      await new Promise(resolve => setTimeout(resolve, 500));

      // Take screenshot of the email
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: true,
      });

      return screenshot as Buffer;
    } catch (error) {
      console.error('❌ Error rendering email:', error);
      throw error;
    } finally {
      await page.close();
    }
  }

  private createEmailHtml(email: {
    subject: string;
    from: string;
    to: string;
    date?: Date;
    text?: string;
    html?: string;
  }): string {
    const content = email.html || this.textToHtml(email.text || '');
    const date = email.date ? email.date.toLocaleString() : 'Unknown';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #ffffff;
            padding: 30px;
            color: #333;
          }
          
          .email-container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            overflow: hidden;
          }
          
          .email-header {
            background: #f5f5f5;
            border-bottom: 1px solid #e0e0e0;
            padding: 20px 25px;
          }
          
          .email-subject {
            font-size: 24px;
            font-weight: 600;
            color: #1a1a1a;
            margin-bottom: 15px;
            word-wrap: break-word;
          }
          
          .email-meta {
            font-size: 14px;
            color: #666;
            line-height: 1.6;
          }
          
          .email-meta-row {
            margin-bottom: 6px;
          }
          
          .email-meta-label {
            font-weight: 600;
            color: #444;
            display: inline-block;
            min-width: 60px;
          }
          
          .email-body {
            padding: 25px;
            font-size: 15px;
            line-height: 1.6;
            color: #333;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          
          .email-body img {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
            margin: 10px 0;
          }
          
          .email-body a {
            color: #0066cc;
            text-decoration: none;
          }
          
          .email-body a:hover {
            text-decoration: underline;
          }
          
          .email-body p {
            margin-bottom: 12px;
          }
          
          .email-body pre {
            background: #f5f5f5;
            padding: 12px;
            border-radius: 4px;
            overflow-x: auto;
            font-family: 'Courier New', monospace;
            font-size: 13px;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="email-header">
            <div class="email-subject">${this.escapeHtml(email.subject)}</div>
            <div class="email-meta">
              <div class="email-meta-row">
                <span class="email-meta-label">From:</span>
                <span>${this.escapeHtml(email.from)}</span>
              </div>
              <div class="email-meta-row">
                <span class="email-meta-label">To:</span>
                <span>${this.escapeHtml(email.to)}</span>
              </div>
              <div class="email-meta-row">
                <span class="email-meta-label">Date:</span>
                <span>${date}</span>
              </div>
            </div>
          </div>
          <div class="email-body">
            ${content}
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private textToHtml(text: string): string {
    // Convert plain text to HTML
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^(.+)/, '<p>$1')
      .replace(/(.+)$/, '$1</p>');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async close(): Promise<void> {
    if (this.browser) {
      console.log('🛑 Closing browser...');
      await this.browser.close();
      this.browser = null;
    }
  }
}
