/**
 * ============================================
 * INBOX HANDLER SERVICE
 * ============================================
 * 
 * ROLE: Connect to email server and retrieve bank alerts
 * 
 * This service:
 * 1. Connects to IMAP server (Gmail, Outlook, bank servers, etc)
 * 2. Searches for unread emails from banks
 * 3. Retrieves the email bodies
 * 4. Returns them for parsing
 * 
 * WORKFLOW:
 * 1. Uses IMAP protocol to connect securely
 * 2. Opens the INBOX folder
 * 3. Searches for recent unseen emails
 * 4. Parses each email to get plain text
 * 5. Returns array of email strings for the parser
 * 
 * WHY SEPARATE:
 * - Keeps email polling logic isolated from parsing/matching
 * - Can be replaced with other email sources (API, webhooks, etc)
 * - Handles connection lifecycle properly
 * - IMAP is complex, good to isolate it
 */

import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { IMAPConfig } from '@/types/index.js';

/**
 * InboxHandler
 * 
 * Manages IMAP email connection and retrieval.
 * Handles the complexity of IMAP protocol so rest of app doesn't have to.
 */
export class InboxHandler {
  private imap: Imap | null = null;
  private config: IMAPConfig;

  /**
   * Initialize the inbox handler with IMAP configuration
   * 
   * @param config - IMAP configuration (host, port, credentials, etc)
   */
  constructor(config: IMAPConfig) {
    this.config = config;
  }

  /**
   * Establish connection to IMAP server and open inbox
   * 
   * This sets up the connection but doesn't keep it open all the time
   * (that would be wasteful). Connections are opened for polling and closed after.
   * 
   * @throws Error if connection fails
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create IMAP instance with configuration
      this.imap = new Imap({
        user: this.config.user,
        password: this.config.password,
        host: this.config.host,
        port: this.config.port,
        tls: this.config.tls,
      });

      // Handle connection errors
      this.imap.on('error', (err) => {
        reject(new Error(`IMAP connection error: ${err.message}`));
      });

      // When ready, open the inbox
      this.imap.on('ready', () => {
        this.imap!.openBox('INBOX', false, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Actually connect
      this.imap.connect();
    });
  }

  /**
   * Poll for new bank alerts
   * 
   * Searches for unread emails received since a certain time,
   * useful for monitoring for new alerts.
   * 
   * Can filter by sender email if provided.
   * 
   * @param since - Only get emails after this date (default: last 15 minutes)
   * @param searchFrom - Optional: only get emails from this sender
   * @returns Array of raw email text strings
   */
  async pollBankAlerts(
    since: Date = new Date(Date.now() - 15 * 60 * 1000),
    searchFrom?: string
  ): Promise<string[]> {
    // Ensure we're connected
    if (!this.imap) await this.connect();

    return new Promise((resolve, reject) => {
      // Build search criteria
      const searchCriteria: string[] = ['UNSEEN'];

      // Add date filter if provided
      if (since) {
        searchCriteria.push(['SINCE', since.toDateString()] as any);
      }

      // Add sender filter if provided
      if (searchFrom) {
        searchCriteria.push(['FROM', searchFrom] as any);
      }

      // Execute search on IMAP server
      this.imap!.search(searchCriteria as any, (err, results) => {
        if (err) {
          reject(new Error(`IMAP search failed: ${err.message}`));
          return;
        }

        // No results = no new alerts
        if (!results || results.length === 0) {
          resolve([]);
          return;
        }

        // Fetch the full message bodies
        const f = this.imap!.fetch(results, { bodies: '' });
        const emails: string[] = [];
        let processedCount = 0;

        // Handle each fetched message
        f.on('message', (msg) => {
          simpleParser(msg, async (err, parsed) => {
            if (err) {
              console.error('Email parsing error:', err);
              return;
            }

            // Extract text from email (ignore HTML)
            const emailText = parsed.text || parsed.html || '';
            emails.push(emailText);
            processedCount++;

            // If all messages processed, resolve
            if (processedCount === results.length) {
              resolve(emails);
            }
          });
        });

        // Handle fetch errors
        f.on('error', (err) => {
          reject(new Error(`IMAP fetch failed: ${err.message}`));
        });
      });
    });
  }

  /**
   * Retrieve all emails matching specific criteria
   * 
   * More flexible than pollBankAlerts - allows custom search criteria.
   * Useful for different use cases.
   * 
   * @param searchCriteria - IMAP search criteria (e.g., ['ALL'], ['FROM', 'bank@gtbank.com'])
   * @returns Array of raw email text strings
   */
  async getEmails(searchCriteria: any[]): Promise<string[]> {
    if (!this.imap) await this.connect();

    return new Promise((resolve, reject) => {
      this.imap!.search(searchCriteria, (err, results) => {
        if (err) reject(err);

        if (!results || results.length === 0) {
          resolve([]);
          return;
        }

        const f = this.imap!.fetch(results, { bodies: '' });
        const emails: string[] = [];
        let processedCount = 0;

        f.on('message', (msg) => {
          simpleParser(msg, async (err, parsed) => {
            if (err) reject(err);
            emails.push(parsed.text || parsed.html || '');
            processedCount++;

            if (processedCount === results.length) {
              resolve(emails);
            }
          });
        });

        f.on('error', reject);
      });
    });
  }

  /**
   * Mark emails as read
   * 
   * After processing alerts, mark them as read so we don't
   * process them again next poll.
   * 
   * @param uids - UIDs of emails to mark as read
   */
  async markAsRead(uids: number[]): Promise<void> {
    if (!this.imap) throw new Error('Not connected to IMAP');

    return new Promise((resolve, reject) => {
      this.imap!.setFlags(uids, ['\\Seen'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Close connection to IMAP server
   * 
   * Should be called when done polling to free up resources.
   * Important for clean shutdown.
   */
  async disconnect(): Promise<void> {
    if (!this.imap) return;

    return new Promise((resolve, reject) => {
      this.imap!.closeBox(false, (err) => {
        if (err) {
          reject(new Error(`Failed to close inbox: ${err.message}`));
          return;
        }

        this.imap!.end();
        this.imap = null;
        resolve();
      });
    });
  }

  /**
   * Check if connected to IMAP
   */
  isConnected(): boolean {
    return this.imap !== null;
  }
}

// Note: Not exporting singleton because each instance needs its own connection