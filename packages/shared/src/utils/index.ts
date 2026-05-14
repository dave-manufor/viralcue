/**
 * Format seconds into human-readable duration
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Calculate remaining streaming hours
 */
export function getRemainingHours(used: number, limit: number): number {
  return Math.max(0, limit - used);
}

/**
 * Check if user has exceeded their streaming limit
 */
export function isOverLimit(used: number, limit: number): boolean {
  return used >= limit;
}

/**
 * Truncate string to max length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Extract keywords from text (simple tokenization)
 */
export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

/**
 * Calculate overage cost
 */
export function calculateOverageCost(
  hoursOver: number,
  costPerBlock: number,
  blockSize: number = 5
): number {
  const blocksNeeded = Math.ceil(hoursOver / blockSize);
  return blocksNeeded * costPerBlock;
}

/**
 * Sleep utility for async operations
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
