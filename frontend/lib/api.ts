import type {
  ApiError,
  CashSlot,
  PaginatedTransactionLogs,
  Product,
  PurchaseRequest,
  PurchaseResponse,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as ApiError;
      msg = body.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listProducts: () => request<Product[]>("/api/products"),
  createProduct: (p: {
    name: string;
    price: number;
    stock: number;
    imageUrl: string;
  }) =>
    request<Product>("/api/products", {
      method: "POST",
      body: JSON.stringify(p),
    }),
  updateProduct: (
    id: number,
    p: Partial<{
      name: string;
      price: number;
      stock: number;
      imageUrl: string;
    }>,
  ) =>
    request<Product>(`/api/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(p),
    }),
  deleteProduct: (id: number) =>
    request<void>(`/api/products/${id}`, { method: "DELETE" }),
  listCash: () => request<CashSlot[]>("/api/cash"),
  setCash: (denomination: number, count: number) =>
    request<CashSlot>("/api/cash", {
      method: "PUT",
      body: JSON.stringify({ denomination, count }),
    }),
  purchase: (req: PurchaseRequest) =>
    request<PurchaseResponse>("/api/purchase", {
      method: "POST",
      body: JSON.stringify(req),
    }),
  listTransactions: (page: number, pageSize: number) =>
    request<PaginatedTransactionLogs>(
      `/api/transactions?page=${encodeURIComponent(page)}&page_size=${encodeURIComponent(pageSize)}`,
    ),
};
