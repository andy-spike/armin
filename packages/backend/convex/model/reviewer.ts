/** Only an operator-selected auth user is ever treated as a disposable account. */
export function isReviewer(userId: string) {
  return (
    Boolean(process.env.REVIEWER_ACCOUNT_USER_ID) && userId === process.env.REVIEWER_ACCOUNT_USER_ID
  );
}

export function reviewerResetHours() {
  const hours = Number(process.env.REVIEWER_RESET_HOURS ?? 6);
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
    throw new Error("REVIEWER_RESET_HOURS must be an integer from 1 to 168.");
  }
  return hours;
}
