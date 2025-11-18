/**
 * ============================================
 * TRANSACTION MATCHER SERVICE
 * ============================================
 */

import { BankAlert, Transaction, MatchResult, MatchDetails } from '@/types/index.js';

/**
 * Safe timestamp converter
 */
function toTimestamp(value: Date | string | number | undefined): number {
  if (!value) return Date.now();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') return new Date(value).getTime() || Date.now();
  if (typeof value === 'number') return value;
  return Date.now();
}

export class TransactionMatcher {
  private readonly TIME_WINDOW_MS = 15 * 60 * 1000;
  private readonly AMOUNT_TOLERANCE = 0.02;
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.6;

  findMatches(alert: BankAlert, transactions: Transaction[]): MatchResult[] {
    return transactions
      .map(txn => this.scoreMatch(alert, txn))
      .sort((a, b) => b.confidence - a.confidence);
  }

  private scoreMatch(alert: BankAlert, txn: Transaction): MatchResult {
    // TIME COMPARISON (SAFE)
    const timeDiff = Math.abs(toTimestamp(alert.timestamp) - toTimestamp(txn.timestamp));
    const isWithinTimeWindow = timeDiff <= this.TIME_WINDOW_MS;

    // AMOUNT COMPARISON
    const amountDiff = Math.abs(alert.amount - txn.amount);
    const amountDiffPercent = alert.amount > 0 ? amountDiff / alert.amount : 0;
    const amountMatches = amountDiffPercent <= this.AMOUNT_TOLERANCE;

    // ACCOUNT COMPARISON
    const accountMatches = alert.accountNumber === txn.accountNumber;

    // DESCRIPTION SIMILARITY
    const descriptionSimilarity = this.calculateSimilarity(
      alert.description,
      txn.description
    );

    // CONFIDENCE SCORING
    let confidence = 0;
    if (amountMatches) confidence += 0.4;
    if (accountMatches) confidence += 0.3;
    if (isWithinTimeWindow) confidence += 0.2;
    confidence += descriptionSimilarity * 0.1;

    const matched = confidence >= this.MIN_CONFIDENCE_THRESHOLD;

    return {
      alertId: alert.id,
      transactionId: matched ? txn.id : null,
      confidence,
      matchDetails: {
        amountMatch: amountMatches,
        amountDifference: amountDiff,
        timeWindow: timeDiff,
        descriptionSimilarity,
      },
      matched,
    };
  }

  // ... [levenshtein, similarity, getConfig] unchanged ...

  calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    const editDistance = this.levenshteinDistance(shorter, longer);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) costs[j] = j;
        else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  }

  getConfig() {
    return {
      timeWindowMs: this.TIME_WINDOW_MS,
      amountTolerance: this.AMOUNT_TOLERANCE,
      confidenceThreshold: this.MIN_CONFIDENCE_THRESHOLD,
    };
  }
}

export const transactionMatcher = new TransactionMatcher();