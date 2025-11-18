/**
 * ============================================
 * BANK PARSER SERVICE
 * ============================================
 * 
 * ROLE: Extract structured data from raw bank alert emails
 * 
 * This service parses different bank email formats and extracts:
 * - Transaction amount
 * - Account number
 * - Transaction timestamp
 * - Transaction type (debit/credit)
 * - Description
 * 
 * WORKFLOW:
 * 1. Receives raw email text from IMAP inbox
 * 2. Identifies which bank it's from based on patterns
 * 3. Uses bank-specific regex patterns to extract data
 * 4. Returns structured BankAlert object
 * 
 * WHY IMPORTANT:
 * - Email formats vary wildly between banks
 * - Must extract data accurately for matching to work
 * - Different Nigerian banks (GTBank, Access, etc) have different formats
 * - Regex patterns handle variations in how banks format amounts, dates, etc
 */

import { BankAlert } from '@/types/index.js';

/**
 * Bank-specific regex patterns for parsing different bank email formats
 * 
 * Each bank has different ways of formatting their alerts:
 * - GTBank: "Amount: ₦50,000.00" vs "NGN 50000"
 * - Access: "NGN 50,000" vs different date formats
 * - etc
 * 
 * These patterns handle the variations so one parser works for all.
 */
const BANK_PATTERNS = {
  gtbank: {
    // Matches: "Amount: ₦50,000.00" or "Amount: 50000"
    amountPattern: /Amount:\s*₦?([\d,]+\.?\d*)/i,
    
    // Matches: "debit" "credit" "withdrawal" "transfer" etc
    typePattern: /(debit|credit|withdrawal|transfer|payment)/i,
    
    // Matches: "15/10/2024 14:30:45" (GTBank date format)
    timePattern: /(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2})/,
    
    // Matches: "Account: ****1234" (masked account)
    accountPattern: /Account:\s*(\*{2,4}\d{4,10})/i,
  },
  
  access: {
    // Matches: "NGN 50,000.00"
    amountPattern: /NGN\s*([\d,]+\.?\d*)/i,
    
    // Matches: "DEBIT" "CREDIT" "Withdrawal" etc
    typePattern: /(DEBIT|CREDIT|Withdrawal|Transfer|Payment)/i,
    
    // Matches: "15-Oct-2024 14:30:45" (Access date format)
    timePattern: /(\d{2}-\w{3}-\d{4}\s+\d{2}:\d{2}:\d{2})/,
    
    // Matches: "A/C: ****1234"
    accountPattern: /A\/C:\s*(\*{2,4}\d{4,10})/i,
  },
  
  // Template for other banks - add more as needed
  firstbank: {
    amountPattern: /Amount\s*[:=]\s*₦?([\d,]+\.?\d*)/i,
    typePattern: /(Debit|Credit)/i,
    timePattern: /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})/,
    accountPattern: /Account\s*[:=]\s*(\*{2,4}\d{4,10})/i,
  },
};

/**
 * BankAlertParser
 * 
 * Responsible for converting raw email text into structured BankAlert objects.
 * Uses bank-specific patterns to handle format variations.
 */
export class BankAlertParser {
  /**
   * Parse a raw email and extract bank alert information
   * 
   * @param email - Raw email text from bank
   * @param bank - Which bank format to use (defaults to gtbank)
   * @returns Partial BankAlert with extracted data
   */
  parseEmail(email: string, bank: string = 'gtbank'): Partial<BankAlert> {
    // Get the correct pattern set for this bank
    const patterns = BANK_PATTERNS[bank as keyof typeof BANK_PATTERNS] || BANK_PATTERNS.gtbank;

    // Extract amount using regex
    const amountMatch = email.match(patterns.amountPattern);
    // Parse the matched amount, removing commas: "50,000" -> 50000
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;

    // Extract transaction type
    const typeMatch = email.match(patterns.typePattern);
    const transactionType = 
      typeMatch?.[1]?.toLowerCase().includes('debit') ||
      typeMatch?.[1]?.toLowerCase().includes('withdrawal')
        ? 'debit'
        : 'credit';

    // Extract timestamp
    const timeMatch = email.match(patterns.timePattern);
    const timestamp = timeMatch ? new Date(timeMatch[1]) : new Date();

    // Extract account number (usually masked)
    const accountMatch = email.match(patterns.accountPattern);
    const accountNumber = accountMatch?.[1] || '';

    // Extract description (first 200 chars of email)
    const description = email.substring(0, 200);

    // Return structured data
    return {
      amount,
      currency: 'NGN',                    // Nigerian Naira (can be made configurable)
      accountNumber,
      description,
      transactionType,
      timestamp,
      rawEmail: email,                    // Keep original for debugging
      bank,
    };
  }

  /**
   * Parse multiple emails at once
   * 
   * @param emails - Array of raw email texts
   * @param bank - Bank format to use for all emails
   * @returns Array of parsed BankAlert objects
   */
  parseEmails(emails: string[], bank: string = 'gtbank'): Partial<BankAlert>[] {
    return emails.map(email => this.parseEmail(email, bank));
  }

  /**
   * Add a new bank pattern to the parser
   * 
   * Allows runtime extension to support new banks without modifying
   * the BANK_PATTERNS constant.
   * 
   * @param bankName - Name of the bank
   * @param patterns - Regex patterns for parsing
   */
  addBankPattern(
    bankName: string,
    patterns: typeof BANK_PATTERNS.gtbank
  ): void {
    BANK_PATTERNS[bankName as keyof typeof BANK_PATTERNS] = patterns;
  }
}

// Export singleton instance
export const bankAlertParser = new BankAlertParser();