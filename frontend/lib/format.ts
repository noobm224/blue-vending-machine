export const thb = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n) +
  " THB";

export const sumInserted = (
  inserted: { denomination: number; count: number }[],
) => inserted.reduce((acc, c) => acc + c.denomination * c.count, 0);
