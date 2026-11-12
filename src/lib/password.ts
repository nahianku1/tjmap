export interface PasswordAssessment {
  score: number; // 0 - 4
  percent: number;
  label: string;
  checks: {
    length: boolean;
    cases: boolean;
    number: boolean;
    symbol: boolean;
    long: boolean;
  };
}

export function assessPassword(password: string): PasswordAssessment {
  const checks = {
    length: password.length >= 8,
    cases: /[a-z]/.test(password) && /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
    long: password.length >= 12,
  };

  let points = 0;
  if (password.length > 0) points += 1;
  if (checks.length) points += 1;
  if (checks.cases) points += 1;
  if (checks.number) points += 1;
  if (checks.symbol) points += 1;
  if (checks.long) points += 1;

  const score = Math.max(0, Math.min(4, Math.round((points / 6) * 4) - (password.length === 0 ? 1 : 0)));
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
  const label = password.length === 0 ? 'Empty' : labels[Math.min(score, 4)];

  return {
    score,
    percent: Math.min(100, Math.round((points / 6) * 100)),
    label,
    checks,
  };
}

export function passwordIsAcceptable(password: string): boolean {
  const assessment = assessPassword(password);
  return assessment.checks.length && password.length >= 8;
}
