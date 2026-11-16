/**
 * Company-wide profit contribution of a booking.
 *
 * Owner's refund rule: when a ticket is refunded, its refunded payable is
 * SUBTRACTED from overall profit ("95k will be minus from the profits"). The
 * record itself still stores its retained fee-margin in `profit` (for display),
 * but every PROFIT TOTAL must use this helper so a refund shows as a net drag.
 *
 * Non-refunded records (and every non-ticket record) return their profit
 * unchanged, so this is safe to apply anywhere profit is summed.
 */
export const effectiveProfit = (b) => {
  const profit = Number(b?.profit) || 0;
  if (b?.refunded) return profit - (Number(b?.payable) || 0);
  return profit;
};
