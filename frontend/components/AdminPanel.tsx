"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { DENOMINATIONS, isCoin } from "@/lib/types";
import type { CashSlot, Product, TransactionLog } from "@/lib/types";
import { thb } from "@/lib/format";
import { ProductImage } from "./ProductImage";
import { FiX } from "react-icons/fi";

type AdminMode = "view" | "manage";
type StockFilter = "all" | "in-stock" | "low-stock" | "out-of-stock";
type ProductSort =
  | "id-asc"
  | "id-desc"
  | "name"
  | "price-asc"
  | "price-desc"
  | "stock-asc"
  | "stock-desc";

const COIN_DENOMINATIONS = DENOMINATIONS.filter((d) => isCoin(d));
const BANKNOTE_DENOMINATIONS = DENOMINATIONS.filter((d) => !isCoin(d));
const LOW_STOCK_THRESHOLD = 3;
const TRANSACTION_PAGE_SIZES = [5, 10, 20, 50] as const;

export function AdminPanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cash, setCash] = useState<CashSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<TransactionLog[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState<string | null>(
    null,
  );
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [transactionsPageSize, setTransactionsPageSize] =
    useState<(typeof TRANSACTION_PAGE_SIZES)[number]>(10);
  const [transactionsTotalItems, setTransactionsTotalItems] = useState(0);
  const [transactionsTotalPages, setTransactionsTotalPages] = useState(0);
  const [mode, setMode] = useState<AdminMode>("view");
  const [productQuery, setProductQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sortBy, setSortBy] = useState<ProductSort>("id-asc");

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [p, c] = await Promise.all([api.listProducts(), api.listCash()]);
      setProducts(p);
      setCash(c);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(
    async (page: number, pageSize: number) => {
      try {
        setTransactionsLoading(true);
        const response = await api.listTransactions(page, pageSize);
        setTransactions(response.items);
        setTransactionsPage(response.page);
        setTransactionsPageSize(
          response.page_size as (typeof TRANSACTION_PAGE_SIZES)[number],
        );
        setTransactionsTotalItems(response.total_items);
        setTransactionsTotalPages(response.total_pages);
        setTransactionsError(null);
      } catch (e) {
        setTransactionsError((e as Error).message);
      } finally {
        setTransactionsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void fetchTransactions(transactionsPage, transactionsPageSize);
  }, [fetchTransactions, transactionsPage, transactionsPageSize]);

  const cashByDenom = Object.fromEntries(
    cash.map((s) => [s.denomination, s.count]),
  );

  const normalizedProductQuery = productQuery.trim().toLowerCase();
  const visibleProducts = useMemo(() => {
    let next = products;

    if (normalizedProductQuery) {
      next = next.filter((p) =>
        p.name.toLowerCase().includes(normalizedProductQuery),
      );
    }

    if (stockFilter !== "all") {
      next = next.filter((p) => matchesStockFilter(p.stock, stockFilter));
    }

    return [...next].sort((a, b) => sortProducts(a, b, sortBy));
  }, [normalizedProductQuery, products, sortBy, stockFilter]);

  const totalStockUnits = useMemo(
    () => products.reduce((sum, p) => sum + p.stock, 0),
    [products],
  );
  const outOfStockCount = useMemo(
    () => products.filter((p) => p.stock <= 0).length,
    [products],
  );
  const inventoryValue = useMemo(
    () => products.reduce((sum, p) => sum + p.price * p.stock, 0),
    [products],
  );
  const totalCashReserve = useMemo(
    () => cash.reduce((sum, slot) => sum + slot.denomination * slot.count, 0),
    [cash],
  );

  return (
    <div className="space-y-6 animate-rise-in">
      {error && (
        <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-rose-600">
          {error}
        </div>
      )}

      <section className="glass-panel rounded-lg p-4 sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Admin Workspace
            </h2>
            <p className="text-sm text-slate-500">
              Use View for monitoring and Manage for inventory updates.
            </p>
          </div>
          <div className="w-full sm:w-auto">
            <div className="grid w-full grid-cols-2 rounded-md border border-slate-200 bg-surface p-1 sm:inline-flex sm:w-auto">
              <button
                type="button"
                onClick={() => setMode("view")}
                className={`w-full rounded px-3 py-1.5 text-center text-sm font-medium transition sm:w-auto ${
                  mode === "view"
                    ? "bg-[#3e8af3] text-white"
                    : "text-slate-900 hover:bg-slate-50"
                }`}
              >
                View
              </button>
              <button
                type="button"
                onClick={() => setMode("manage")}
                className={`w-full rounded px-3 py-1.5 text-center text-sm font-medium transition sm:w-auto ${
                  mode === "manage"
                    ? "bg-[#3e8af3] text-white"
                    : "text-slate-900 hover:bg-slate-50"
                }`}
              >
                Manage
              </button>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <section className="glass-panel rounded-lg p-4 sm:p-5">
          <div className="text-slate-500">Loading admin data...</div>
        </section>
      ) : mode === "view" ? (
        <>
          <section className="glass-panel rounded-lg p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">
                Products
              </h3>
              <span className="text-xs text-slate-500">
                {visibleProducts.length} item
                {visibleProducts.length === 1 ? "" : "s"}
              </span>
            </div>
            <section className="grid gap-3 sm:grid-cols-2 mb-3 xl:grid-cols-4">
              <MetricCard
                label="Products"
                value={`${products.length}`}
                tone="sky"
              />
              <MetricCard
                label="Stock Units"
                value={`${totalStockUnits}`}
                tone="indigo"
              />
              <MetricCard
                label="Inventory Value"
                value={thb(inventoryValue)}
                tone="emerald"
              />
              <MetricCard
                label="Out of stock"
                value={`${outOfStockCount}`}
                tone="rose"
              />
            </section>
            <ProductFiltersBar
              productQuery={productQuery}
              onProductQueryChange={setProductQuery}
              stockFilter={stockFilter}
              onStockFilterChange={setStockFilter}
              sortBy={sortBy}
              onSortByChange={setSortBy}
            />
            <ProductViewTable products={visibleProducts} />
          </section>

          <section className="glass-panel rounded-lg p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">
                Cash Inventory
              </h3>
              <span className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-900">
                Total cash: {thb(totalCashReserve)}
              </span>
            </div>
            <CashViewGrid cashByDenom={cashByDenom} />
          </section>
        </>
      ) : (
        <>
          <section className="glass-panel rounded-lg p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">
                Manage Products
              </h3>
              <span className="text-xs text-slate-500">
                {visibleProducts.length} item
                {visibleProducts.length === 1 ? "" : "s"}
              </span>
            </div>
            <section className="grid gap-3 sm:grid-cols-2 mb-3 xl:grid-cols-4">
              <MetricCard
                label="Products"
                value={`${products.length}`}
                tone="sky"
              />
              <MetricCard
                label="Stock Units"
                value={`${totalStockUnits}`}
                tone="indigo"
              />
              <MetricCard
                label="Inventory Value"
                value={thb(inventoryValue)}
                tone="emerald"
              />
              <MetricCard
                label="Out of stock"
                value={`${outOfStockCount}`}
                tone="rose"
              />
            </section>
            <ProductFiltersBar
              productQuery={productQuery}
              onProductQueryChange={setProductQuery}
              stockFilter={stockFilter}
              onStockFilterChange={setStockFilter}
              sortBy={sortBy}
              onSortByChange={setSortBy}
            />
            <ProductManageTable
              products={visibleProducts}
              onChange={refresh}
              onError={setError}
            />
          </section>

          <section className="glass-panel rounded-lg p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">
                Manage Cash Inventory
              </h3>
              <span className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-900">
                Total cash: {thb(totalCashReserve)}
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <CashManageGroup
                title="Coins"
                denominations={COIN_DENOMINATIONS}
                cashByDenom={cashByDenom}
                onSaved={refresh}
                onError={setError}
              />
              <CashManageGroup
                title="Banknotes"
                denominations={BANKNOTE_DENOMINATIONS}
                cashByDenom={cashByDenom}
                onSaved={refresh}
                onError={setError}
              />
            </div>
          </section>
        </>
      )}

      {!loading && (
        <section className="glass-panel rounded-lg p-4 sm:p-5">
          <TransactionLogsPanel
            items={transactions}
            loading={transactionsLoading}
            error={transactionsError}
            page={transactionsPage}
            pageSize={transactionsPageSize}
            totalItems={transactionsTotalItems}
            totalPages={transactionsTotalPages}
            onRetry={() =>
              void fetchTransactions(transactionsPage, transactionsPageSize)
            }
            onPreviousPage={() =>
              setTransactionsPage((current) => Math.max(1, current - 1))
            }
            onNextPage={() =>
              setTransactionsPage((current) => {
                if (transactionsTotalPages <= 0) return current;
                return Math.min(transactionsTotalPages, current + 1);
              })
            }
            onPageSizeChange={(nextPageSize) => {
              setTransactionsPageSize(nextPageSize);
              setTransactionsPage(1);
            }}
          />
        </section>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "sky" | "indigo" | "emerald" | "amber" | "rose";
}) {
  const toneClass = {
    sky: "border-slate-200 bg-[#eff7ff] text-[#2057d5]",
    indigo: "border-slate-200 bg-surface text-slate-900",
    emerald: "border-[#d8f3e3] bg-[#effaf4] text-[#1e7d56]",
    amber: "border-rose-100 bg-rose-50 text-rose-600",
    rose: "border-rose-100 bg-rose-50 text-rose-600",
  }[tone];

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function ProductFiltersBar({
  productQuery,
  onProductQueryChange,
  stockFilter,
  onStockFilterChange,
  sortBy,
  onSortByChange,
}: {
  productQuery: string;
  onProductQueryChange: (value: string) => void;
  stockFilter: StockFilter;
  onStockFilterChange: (value: StockFilter) => void;
  sortBy: ProductSort;
  onSortByChange: (value: ProductSort) => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[36rem] xl:flex-1">
        <input
          type="text"
          value={productQuery}
          onChange={(e) => onProductQueryChange(e.target.value)}
          placeholder="Search products by name"
          className="w-full rounded-md border border-slate-200 bg-surface px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-[#3e8af3] focus:outline-none sm:col-span-3 xl:col-span-1"
        />
        <div className="relative">
          <select
            value={stockFilter}
            onChange={(e) => onStockFilterChange(e.target.value as StockFilter)}
            className="w-full appearance-none rounded-md border border-slate-200 bg-surface pl-3 pr-10 py-2 text-sm text-slate-900 focus:border-[#3e8af3] focus:outline-none"
          >
            <option value="all">All stock</option>
            <option value="in-stock">In stock</option>
            <option value="low-stock">Low stock</option>
            <option value="out-of-stock">Out of stock</option>
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path
                d="M5 7.5L10 12.5L15 7.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as ProductSort)}
            className="w-full appearance-none rounded-md border border-slate-200 bg-surface pl-3 pr-10 py-2 text-sm text-slate-900 focus:border-[#3e8af3] focus:outline-none"
          >
            <option value="id-asc">Sort: ID low-high</option>
            <option value="id-desc">Sort: ID high-low</option>
            <option value="name">Sort: Name</option>
            <option value="price-asc">Sort: Price low-high</option>
            <option value="price-desc">Sort: Price high-low</option>
            <option value="stock-asc">Sort: Stock low-high</option>
            <option value="stock-desc">Sort: Stock high-low</option>
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path
                d="M5 7.5L10 12.5L15 7.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

function ProductViewTable({ products }: { products: Product[] }) {
  return (
    <div className="max-h-[65vh] overflow-auto rounded-lg border border-slate-200 bg-surface">
      <table className="min-w-[48rem] w-full text-sm">
        <thead className="sticky top-0 z-10 bg-surface-92 text-left text-xs uppercase tracking-wide text-slate-500 backdrop-blur-sm">
          <tr>
            <th className="px-3 py-2">ID</th>
            <th className="px-3 py-2">Image</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Price</th>
            <th className="px-3 py-2">Stock</th>
            <th className="px-3 py-2 whitespace-nowrap">Status</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr
              key={p.id}
              className="border-t border-slate-200 hover:bg-slate-50"
            >
              <td className="px-3 py-2 text-slate-900">{p.id}</td>
              <td className="px-3 py-2">
                <ProductImage
                  src={p.imageUrl}
                  alt={`${p.name} thumbnail`}
                  className="h-14 w-14 rounded-md border border-slate-200 object-cover"
                />
              </td>
              <td className="px-3 py-2 font-medium text-slate-900">{p.name}</td>
              <td className="px-3 py-2 text-slate-500">{thb(p.price)}</td>
              <td className="px-3 py-2 text-slate-500">{p.stock}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                <StockBadge stock={p.stock} />
              </td>
            </tr>
          ))}
          {products.length === 0 && (
            <tr className="border-t border-slate-200">
              <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                No products found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CashViewGrid({
  cashByDenom,
}: {
  cashByDenom: Record<number, number>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CashViewGroup
        title="Coins"
        denominations={COIN_DENOMINATIONS}
        cashByDenom={cashByDenom}
      />
      <CashViewGroup
        title="Banknotes"
        denominations={BANKNOTE_DENOMINATIONS}
        cashByDenom={cashByDenom}
      />
    </div>
  );
}

function CashViewGroup({
  title,
  denominations,
  cashByDenom,
}: {
  title: string;
  denominations: readonly number[];
  cashByDenom: Record<number, number>;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h4>
        <span className="text-xs text-slate-500">
          {thb(
            denominations.reduce(
              (sum, d) => sum + d * (cashByDenom[d] ?? 0),
              0,
            ),
          )}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {denominations.map((d) => (
          <div
            key={`${title}-${d}`}
            className="flex items-center justify-between rounded-md border border-slate-200 bg-surface px-3 py-2"
          >
            <span className="text-sm text-slate-900">{thb(d)}</span>
            <span className="text-sm font-medium text-slate-900">
              x{cashByDenom[d] ?? 0}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransactionLogsPanel({
  items,
  loading,
  error,
  page,
  pageSize,
  totalItems,
  totalPages,
  onRetry,
  onPreviousPage,
  onNextPage,
  onPageSizeChange,
}: {
  items: TransactionLog[];
  loading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onRetry: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onPageSizeChange: (value: (typeof TRANSACTION_PAGE_SIZES)[number]) => void;
}) {
  const startIndex = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = totalItems === 0 ? 0 : Math.min(page * pageSize, totalItems);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Transaction Logs
          </h3>
          <p className="text-sm text-slate-500">
            Latest purchases captured by the machine transaction journal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Page size
          </label>
          <div className="relative">
            <select
              value={pageSize}
              onChange={(e) =>
                onPageSizeChange(
                  Number(
                    e.target.value,
                  ) as (typeof TRANSACTION_PAGE_SIZES)[number],
                )
              }
              className="appearance-none rounded-md border border-slate-200 bg-surface pl-3 pr-10 py-1.5 text-sm text-slate-900 focus:border-[#3e8af3] focus:outline-none"
            >
              {TRANSACTION_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500">
              <svg
                viewBox="0 0 20 20"
                fill="none"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path
                  d="M5 7.5L10 12.5L15 7.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex flex-col gap-2 rounded-lg border border-rose-100 bg-rose-50 p-3 text-sm text-rose-600 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-rose-200 bg-white px-3 py-1.5 font-medium text-rose-600 hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      )}

      <div className="max-h-[38rem] overflow-auto rounded-lg border border-slate-200 bg-surface">
        <table className="min-w-[52rem] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface-92 text-left text-xs uppercase tracking-wide text-slate-500 backdrop-blur-sm">
            <tr>
              <th className="px-3 py-2 whitespace-nowrap">Time</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Paid</th>
              <th className="px-3 py-2">Change</th>
              <th className="px-3 py-2 whitespace-nowrap">Transaction #</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-t border-slate-200">
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-slate-500"
                >
                  Loading transactions...
                </td>
              </tr>
            ) : items.length > 0 ? (
              items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-slate-200 hover:bg-slate-50"
                >
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                    {formatTransactionTime(item.created_at)}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <span>{item.product_name}</span>
                      <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-normal text-slate-500">
                        ID {item.product_id}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {thb(item.price)}
                  </td>
                  <td className="px-3 py-2 text-slate-900">{thb(item.paid)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded px-2 py-1 text-xs ${
                        item.change_amount > 0
                          ? "border border-[#d8f3e3] bg-[#effaf4] text-[#1e7d56]"
                          : "border border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      {item.change_amount > 0
                        ? thb(item.change_amount)
                        : "No change"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">#{item.id}</td>
                </tr>
              ))
            ) : (
              <tr className="border-t border-slate-200">
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-slate-500"
                >
                  No transactions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-slate-500">
          Showing {startIndex}-{endIndex} of {totalItems} transaction
          {totalItems === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">
            Page {totalPages === 0 ? 0 : page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={onPreviousPage}
            disabled={loading || page <= 1}
            className="rounded-md border border-slate-200 bg-surface px-3 py-1.5 text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={onNextPage}
            disabled={loading || totalPages === 0 || page >= totalPages}
            className="rounded-md bg-[#3e8af3] px-3 py-1.5 text-white hover:bg-[#286ce8] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductManageTable({
  products,
  onChange,
  onError,
}: {
  products: Product[];
  onChange: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const [draft, setDraft] = useState({
    name: "",
    price: 0,
    stock: 0,
    imageUrl: "",
  });
  const [creating, setCreating] = useState(false);
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const canCreate =
    draft.name.trim().length > 0 &&
    draft.price > 0 &&
    Number.isFinite(draft.stock) &&
    draft.stock >= 0;

  const submit = async () => {
    if (!canCreate) return;
    try {
      setCreating(true);
      setCreateError(null);
      await api.createProduct({
        ...draft,
        name: draft.name.trim(),
        imageUrl: draft.imageUrl.trim(),
      });
      setDraft({ name: "", price: 0, stock: 0, imageUrl: "" });
      setOpenCreateModal(false);
      await onChange();
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setCreateError(null);
            setOpenCreateModal(true);
          }}
          className="rounded-lg bg-[#3e8af3] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#286ce8]"
        >
          Add product
        </button>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-surface">
        <table className="min-w-[60rem] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface-95 text-left text-xs uppercase tracking-wide text-slate-500 backdrop-blur-sm">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2 whitespace-nowrap">Status</th>
              <th className="px-3 py-2 min-w-[18rem]">Image</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <ProductRow
                key={p.id}
                product={p}
                onChange={onChange}
                onError={onError}
              />
            ))}
            {products.length === 0 && (
              <tr className="border-t border-slate-200">
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openCreateModal && (
        <AddProductModal
          draft={draft}
          setDraft={setDraft}
          creating={creating}
          canCreate={canCreate}
          errorMessage={createError}
          onSubmit={submit}
          onClose={() => {
            if (creating) return;
            setOpenCreateModal(false);
            setCreateError(null);
          }}
        />
      )}
    </div>
  );
}

function AddProductModal({
  draft,
  setDraft,
  creating,
  canCreate,
  errorMessage,
  onSubmit,
  onClose,
}: {
  draft: { name: string; price: number; stock: number; imageUrl: string };
  setDraft: React.Dispatch<
    React.SetStateAction<{
      name: string;
      price: number;
      stock: number;
      imageUrl: string;
    }>
  >;
  creating: boolean;
  canCreate: boolean;
  errorMessage: string | null;
  onSubmit: () => Promise<void>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !creating) {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [creating, onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  const modal = (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/30 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
        <div className="w-full max-w-4xl">
          <div className="rounded-xl border border-slate-200 bg-surface shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-6">
              <h4 className="text-lg font-semibold text-slate-900">
                Add product
              </h4>
              <button
                type="button"
                onClick={onClose}
                disabled={creating}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-900 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            {errorMessage && (
              <p className="mx-4 mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-600 sm:mx-6">
                {errorMessage}
              </p>
            )}

            <div className="grid gap-5 px-4 py-4 sm:px-6 sm:py-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)]">
              <div className="space-y-4">
                <label className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Product name
                  </span>
                  <input
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                    placeholder="Product name"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Price
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={draft.price}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          price: parseNumericInput(e.target.value),
                        })
                      }
                      placeholder="Price"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Stock
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={draft.stock}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          stock: parseNumericInput(e.target.value),
                        })
                      }
                      placeholder="Stock"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900"
                    />
                  </label>
                </div>

                <label className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Image URL
                  </span>
                  <input
                    value={draft.imageUrl}
                    onChange={(e) =>
                      setDraft({ ...draft, imageUrl: e.target.value })
                    }
                    placeholder="https://example.com/item.png"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900"
                  />
                </label>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Preview
                </span>
                <div className="rounded-lg border border-slate-200 bg-surface p-3">
                  <ProductImage
                    src={draft.imageUrl}
                    alt="New product preview"
                    className="h-44 w-full rounded-md border border-slate-200 object-cover sm:h-56"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={onClose}
                disabled={creating}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-900 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onSubmit()}
                disabled={!canCreate || creating}
                className="rounded-lg bg-[#3e8af3] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#286ce8] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                {creating ? "Adding..." : "Add product"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function ProductRow({
  product,
  onChange,
  onError,
}: {
  product: Product;
  onChange: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const [price, setPrice] = useState(product.price);
  const [stock, setStock] = useState(product.stock);
  const [imageUrl, setImageUrl] = useState(product.imageUrl);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [openDeleteModal, setOpenDeleteModal] = useState(false);

  useEffect(() => {
    setPrice(product.price);
    setStock(product.stock);
    setImageUrl(product.imageUrl);
  }, [product]);

  const normalizedImageUrl = imageUrl.trim();
  const dirty =
    price !== product.price ||
    stock !== product.stock ||
    normalizedImageUrl !== product.imageUrl;
  const validValues =
    Number.isFinite(price) && Number.isFinite(stock) && price > 0 && stock >= 0;

  const save = async () => {
    if (!dirty) return;
    try {
      setSaving(true);
      await api.updateProduct(product.id, {
        price,
        stock,
        imageUrl: normalizedImageUrl,
      });
      await onChange();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    try {
      setRemoving(true);
      await api.deleteProduct(product.id);
      setOpenDeleteModal(false);
      await onChange();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setRemoving(false);
    }
  };

  const reset = () => {
    setPrice(product.price);
    setStock(product.stock);
    setImageUrl(product.imageUrl);
  };

  return (
    <>
      <tr
        className={`border-t border-slate-200 ${
          dirty ? "bg-slate-50" : "hover:bg-slate-50"
        }`}
      >
        <td className="px-3 py-2 text-slate-900">{product.id}</td>
        <td className="px-3 py-2 font-medium text-slate-900">{product.name}</td>
        <td className="px-3 py-2">
          <input
            type="number"
            min={1}
            value={price}
            onChange={(e) => setPrice(parseNumericInput(e.target.value))}
            className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-slate-900"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            min={0}
            value={stock}
            onChange={(e) => setStock(parseNumericInput(e.target.value))}
            className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-slate-900"
          />
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <StockBadge stock={stock} />
        </td>
        <td className="px-3 py-2">
          <div className="flex min-w-[18rem] items-center gap-2">
            <ProductImage
              src={imageUrl}
              alt={`${product.name} preview`}
              className="h-12 w-12 rounded-md border border-slate-200 object-cover"
            />
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/item.png"
              className="w-[15rem] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-slate-900"
            />
          </div>
        </td>
        <td className="px-3 py-2">
          <div className="flex justify-end gap-2 whitespace-nowrap">
            {!validValues && (
              <span className="rounded border border-rose-100 bg-rose-50 px-2 py-1 text-xs text-rose-600">
                Invalid
              </span>
            )}
            <button
              type="button"
              onClick={reset}
              disabled={!dirty || saving || removing}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset
            </button>
            <button
              onClick={save}
              disabled={!dirty || !validValues || saving || removing}
              className="rounded-lg bg-[#2e9b6c] px-2.5 py-1 text-white hover:bg-[#186447] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setOpenDeleteModal(true)}
              disabled={saving || removing}
              className="rounded-lg border border-rose-100 px-2.5 py-1 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {removing ? "Deleting..." : "Delete"}
            </button>
          </div>
        </td>
      </tr>

      {openDeleteModal && (
        <ConfirmDeleteModal
          productName={product.name}
          removing={removing}
          onClose={() => {
            if (removing) return;
            setOpenDeleteModal(false);
          }}
          onConfirm={confirmRemove}
        />
      )}
    </>
  );
}

function ConfirmDeleteModal({
  productName,
  removing,
  onClose,
  onConfirm,
}: {
  productName: string;
  removing: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !removing) {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, removing]);

  if (typeof document === "undefined") {
    return null;
  }

  const modal = (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/30 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-surface shadow-2xl">
          <div className="px-4 py-3 sm:px-5">
            <h4 className="text-base font-semibold text-slate-900">
              Delete product
            </h4>
            <p className="mt-1 text-sm text-slate-500">
              Are you sure you want to delete{" "}
              <span className="font-medium text-slate-900">{productName}</span>?
            </p>
          </div>
          <div className="flex justify-end gap-2 px-4 py-3 sm:px-5">
            <button
              type="button"
              onClick={onClose}
              disabled={removing}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-900 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={removing}
              className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-50"
            >
              {removing ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function CashManageRow({
  denomination,
  count,
  onSaved,
  onError,
}: {
  denomination: number;
  count: number;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const [value, setValue] = useState(count);
  const [saving, setSaving] = useState(false);

  useEffect(() => setValue(count), [count]);

  const dirty = value !== count;

  const save = async () => {
    if (!dirty) return;
    try {
      setSaving(true);
      await api.setCash(denomination, value);
      await onSaved();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setValue(count);

  return (
    <div className="rounded-xl border border-slate-200 bg-surface p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">
          {thb(denomination)}
        </span>
      </div>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(parseNumericInput(e.target.value))}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-slate-900"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={!dirty || saving}
          className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reset
        </button>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="flex-1 rounded-lg bg-[#3e8af3] px-2 py-1.5 text-xs font-medium text-white transition hover:bg-[#286ce8] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          {saving ? "Saving..." : "Set"}
        </button>
      </div>
    </div>
  );
}

function CashManageGroup({
  title,
  denominations,
  cashByDenom,
  onSaved,
  onError,
}: {
  title: string;
  denominations: readonly number[];
  cashByDenom: Record<number, number>;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h4>
        <span className="text-xs text-slate-500">
          {thb(
            denominations.reduce(
              (sum, d) => sum + d * (cashByDenom[d] ?? 0),
              0,
            ),
          )}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {denominations.map((d) => (
          <CashManageRow
            key={`${title}-${d}`}
            denomination={d}
            count={cashByDenom[d] ?? 0}
            onSaved={onSaved}
            onError={onError}
          />
        ))}
      </div>
    </div>
  );
}

function StockBadge({ stock }: { stock: number }) {
  if (!Number.isFinite(stock)) {
    return (
      <span className="inline-flex whitespace-nowrap rounded border border-rose-100 bg-rose-50 px-2 py-1 text-xs text-rose-600">
        Invalid
      </span>
    );
  }

  if (stock <= 0) {
    return (
      <span className="inline-flex whitespace-nowrap rounded border border-rose-100 bg-rose-50 px-2 py-1 text-xs text-rose-600">
        Out of stock
      </span>
    );
  }

  if (stock <= LOW_STOCK_THRESHOLD) {
    return (
      <span className="inline-flex whitespace-nowrap rounded border border-rose-100 bg-rose-50 px-2 py-1 text-xs text-rose-600">
        Low stock
      </span>
    );
  }

  return (
    <span className="inline-flex whitespace-nowrap rounded border border-[#d8f3e3] bg-[#effaf4] px-2 py-1 text-xs text-[#1e7d56]">
      In stock
    </span>
  );
}

function matchesStockFilter(stock: number, filter: StockFilter) {
  if (filter === "all") return true;
  if (filter === "in-stock") return stock > 0;
  if (filter === "out-of-stock") return stock <= 0;
  return stock > 0 && stock <= LOW_STOCK_THRESHOLD;
}

function sortProducts(a: Product, b: Product, sortBy: ProductSort) {
  if (sortBy === "id-asc") return a.id - b.id;
  if (sortBy === "id-desc") return b.id - a.id;
  if (sortBy === "price-asc") return a.price - b.price;
  if (sortBy === "price-desc") return b.price - a.price;
  if (sortBy === "stock-asc") return a.stock - b.stock;
  if (sortBy === "stock-desc") return b.stock - a.stock;
  return a.name.localeCompare(b.name);
}

function parseNumericInput(raw: string) {
  if (raw.trim() === "") return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTransactionTime(raw: string) {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
