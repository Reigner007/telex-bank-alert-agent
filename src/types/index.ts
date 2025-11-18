/**
 * ============================================
 * TYPE DEFINITIONS MODULE
 * ============================================
 * 
 * ROLE: Centralized type definitions for the entire application
 * 
 * This file defines all TypeScript interfaces and types used across:
 * - Bank alert data structures
 * - Transaction records
 * - Matching results
 * - Agent metrics
 * - API request/response formats
 * 
 * BENEFITS:
 * - Type safety across the application
 * - Single source of truth for data shapes
 * - Better IDE autocomplete
 * - Catch errors at compile time
 */

/**
 * BankAlert - Represents a parsed bank alert email
 * 
 * Contains all relevant information extracted from a bank's email alert
 * after parsing the raw email text.
 */
export interface BankAlert {
  id: string;                           // Unique identifier for this alert
  timestamp: Date;                      // When the transaction occurred
  amount: number;                       // Transaction amount in specified currency
  currency: string;                     // Currency code (e.g., NGN, USD)
  accountNumber: string;                // Bank account (usually masked like **** 1234)
  description: string;                  // Transaction description/narration
  transactionType: 'debit' | 'credit'; // Whether money went out or in
  rawEmail: string;                     // Original email text (for debugging)
  bank: string;                         // Which bank sent the alert (gtbank, access, etc)
}

/**
 * Transaction - Represents a transaction from the polled transaction list
 * 
 * These are transactions previously polled from APIs at 15-minute intervals.
 * We try to match bank alerts against these to track which alerts correspond
 * to which transactions.
 */
export interface Transaction {
  id: string;                                      // Unique transaction ID
  timestamp: Date;                                 // When it occurred
  amount: number;                                  // Amount in currency
  currency: string;                               // Currency code
  accountNumber: string;                          // Account involved
  description: string;                            // What it was for
  status: 'pending' | 'completed' | 'failed';    // Current status
  source: string;                                 // Where this data came from (API name, etc)
}

/**
 * MatchDetails - Detailed breakdown of why a match has a certain confidence
 * 
 * This helps debug matching logic and understand what factors contributed
 * to the confidence score.
 */
export interface MatchDetails {
  amountMatch: boolean;              // Did amounts match within tolerance?
  amountDifference: number;          // How much difference in amount (NGN)
  timeWindow: number;                // Time difference in milliseconds
  descriptionSimilarity: number;     // Similarity score 0-1
}

/**
 * MatchResult - Result of attempting to match an alert to a transaction
 * 
 * For each bank alert, we attempt to find matching transactions and
 * return the results with confidence scores.
 */
export interface MatchResult {
  alertId: string;                   // Which alert this result is for
  transactionId: string | null;      // Which transaction matched (if any)
  confidence: number;                // Confidence score 0-1 (0.8+ = good match)
  matchDetails: MatchDetails;        // Breakdown of the scoring
  matched: boolean;                  // Was a match found above threshold?
}

/**
 * AgentMetrics - Tracking statistics about agent performance
 * 
 * Used to calculate accuracy and monitor performance over time.
 * Helps determine if we're meeting the 80% accuracy target.
 */
export interface AgentMetrics {
  totalAlerts: number;               // Total alerts processed
  matchedAlerts: number;             // How many were successfully matched
  accuracy: number;                  // Percentage matched (0-1)
  lastRun: Date;                     // When was the last processing run
}

/**
 * A2ARequest - Incoming JSON-RPC 2.0 request from Telex
 * 
 * This is the standard format Telex sends to our A2A endpoint.
 * Complies with JSON-RPC 2.0 specification.
 */
export interface A2ARequest {
  jsonrpc: '2.0';                    // JSON-RPC version
  id: string | number;               // Request ID (for matching response)
  method: string;                    // Method to call
  params?: {                         // Request parameters
    message?: A2AMessage;
    messages?: A2AMessage[];
    emails?: string[];               // Bank alert emails to process
    transactions?: Transaction[];    // Transaction list to match against
    bankType?: string;               // Which bank format to parse
    contextId?: string;
    taskId?: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * A2AMessage - Message in A2A protocol format
 * 
 * Represents a single message in a conversation, can contain
 * multiple parts (text, data, artifacts).
 */
export interface A2AMessage {
  kind: 'message';
  role: 'user' | 'agent';
  parts: A2APart[];
  messageId?: string;
  taskId?: string;
}

/**
 * A2APart - A single part of an A2A message
 * 
 * Messages can have multiple parts - text, data objects, etc.
 */
export interface A2APart {
  kind: 'text' | 'data';
  text?: string;                     // For text parts
  data?: unknown;                    // For data parts
}

/**
 * A2AResponse - Response in A2A protocol format
 * 
 * This is what we return to Telex. Complies with JSON-RPC 2.0.
 */
export interface A2AResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: {
    id: string;
    contextId: string;
    status: {
      state: 'completed' | 'processing' | 'error';
      timestamp: string;
      message: A2AMessage;
    };
    artifacts: A2AArtefact[];
    history: unknown[];
    kind: 'task';
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * A2AArtefact - Structured data artifact in response
 * 
 * Artifacts carry the actual results (match data, metrics, etc.)
 * back to Telex in a structured format.
 */
export interface A2AArtefact {
  artifactId: string;
  name: string;
  parts: A2APart[];
}

/**
 * IMAPConfig - Configuration for IMAP email connection
 * 
 * Used to connect to email servers to poll bank alerts.
 */
export interface IMAPConfig {
  user: string;                      // Email address
  password: string;                  // Email password or app-specific password
  host: string;                      // IMAP server (e.g., imap.gmail.com)
  port: number;                      // IMAP port (usually 993)
  tls: boolean;                      // Use TLS encryption
}

/**
 * AgentConfig - Configuration for the bank alert agent
 * 
 * Centralizes all configuration for the agent instance.
 */
export interface AgentConfig {
  imapConfig?: IMAPConfig;           // Email polling configuration
  bankTypes?: string[];              // Which banks to support
  timeWindowMs?: number;             // Time window for matching (default 15 min)
  amountTolerance?: number;          // Percentage tolerance for amount matching
  confidenceThreshold?: number;      // Minimum confidence for a match
}