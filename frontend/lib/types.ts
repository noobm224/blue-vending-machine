export type Product = {
  id: number;
  name: string;
  price: number;
  stock: number;
  imageUrl: string;
  created_at: string;
  updated_at: string;
};

export type CashSlot = {
  denomination: number;
  count: number;
};

export type InsertedCoin = { denomination: number; count: number };

export type PurchaseRequest = {
  product_id: number;
  inserted: InsertedCoin[];
};

export type PurchaseResponse = {
  product_id: number;
  product_name: string;
  price: number;
  paid: number;
  change_amount: number;
  change: CashSlot[];
  remaining_stock: number;
};

export type TransactionLog = {
  id: number;
  product_id: number;
  product_name: string;
  price: number;
  paid: number;
  change_amount: number;
  created_at: string;
};

export type PaginatedTransactionLogs = {
  items: TransactionLog[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
};

export type ApiError = { error: string; message: string };

export const DENOMINATIONS = [1, 5, 10, 20, 50, 100, 500, 1000] as const;
export type Denomination = (typeof DENOMINATIONS)[number];

export const isCoin = (d: number) => d === 1 || d === 5 || d === 10;
