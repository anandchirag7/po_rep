/**
 * teradataValidator.ts
 * 
 * Static regex validation for common Teradata SQL errors.
 * Returns an error string if an anti-pattern is detected, or null if it passes.
 */

export function validateTeradataSQL(sql: string): string | null {
  const upperSQL = sql.toUpperCase();

  // 1. LIMIT check (Teradata uses TOP or SAMPLE, not LIMIT)
  if (/\bLIMIT\b/.test(upperSQL)) {
    return "Teradata does not support the 'LIMIT' keyword. Please use 'SAMPLE n' or 'TOP n' instead.";
  }

  // 2. NOW() / GETDATE() / CURDATE() check (Teradata uses CURRENT_TIMESTAMP or CURRENT_DATE)
  if (/\bNOW\(\)/.test(upperSQL) || /\bGETDATE\(\)/.test(upperSQL) || /\bCURDATE\(\)/.test(upperSQL)) {
    return "Teradata uses 'CURRENT_TIMESTAMP' or 'CURRENT_DATE' instead of 'NOW()', 'GETDATE()', or 'CURDATE()'.";
  }

  // 3. ISNULL() / IFNULL() check (Teradata uses COALESCE)
  if (/\bISNULL\s*\(/.test(upperSQL) || /\bIFNULL\s*\(/.test(upperSQL)) {
    return "Teradata uses 'COALESCE(column, default_value)' instead of 'ISNULL()' or 'IFNULL()'.";
  }

  // 4. CONCAT() check (Teradata uses || operator)
  if (/\bCONCAT\s*\(/.test(upperSQL)) {
    return "Teradata prefers the '||' operator for string concatenation instead of the 'CONCAT()' function.";
  }

  // 5. DATEADD / DATEDIFF check
  if (/\bDATEADD\s*\(/.test(upperSQL) || /\bDATEDIFF\s*\(/.test(upperSQL)) {
    return "Teradata uses '+ INTERVAL' or date subtraction instead of 'DATEADD()' or 'DATEDIFF()'.";
  }

  // 6. SQL Server / Oracle specific functions check
  if (/\bNVL2\s*\(/.test(upperSQL)) return "Use 'CASE' instead of 'NVL2()'.";
  if (/\bLEN\s*\(/.test(upperSQL)) return "Use 'CHAR_LENGTH()' instead of 'LEN()'.";
  if (/\bSYSDATE\b/.test(upperSQL)) return "Use 'CURRENT_DATE' instead of 'SYSDATE'.";
  if (/\bSTRING_AGG\s*\(/.test(upperSQL)) return "Use 'XMLAGG' instead of 'STRING_AGG()'.";
  if (/\bIIF\s*\(/.test(upperSQL)) return "Use 'CASE' instead of 'IIF()'.";

  // 7. Basic aggregation without GROUP BY check
  const hasAggregates = /\b(SUM|COUNT|MAX|MIN|AVG)\s*\(/.test(upperSQL);
  const hasGroupBy = /\bGROUP\s+BY\b/.test(upperSQL);
  
  if (hasAggregates && !hasGroupBy) {
    // Note: It is theoretically possible to have aggregates without GROUP BY if there are NO unaggregated columns,
    // but in the context of these procurement queries, an aggregate almost always requires a GROUP BY.
    // To be safe, we only flag it if there are columns selected outside of the aggregate.
    // A simple heuristic: if it contains an aggregate but no GROUP BY, and has a comma in the SELECT list, it's likely wrong.
    const selectClauseMatch = upperSQL.match(/SELECT\s+(.+?)\s+FROM/s);
    if (selectClauseMatch) {
      const selectClause = selectClauseMatch[1];
      // If there are commas separating columns, and we have an aggregate, we likely need a GROUP BY
      if (selectClause.includes(',') && !upperSQL.includes('OVER (')) {
         return "The query contains aggregate functions (like SUM or COUNT) alongside other columns, but is missing a 'GROUP BY' clause.";
      }
    }
  }

  return null; // Passes basic static validation
}
