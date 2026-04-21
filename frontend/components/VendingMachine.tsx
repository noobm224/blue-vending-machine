"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { thb } from "@/lib/format";
import { FiChevronDown, FiChevronUp, FiX } from "react-icons/fi";
import type {
  CashSlot,
  Denomination,
  Product,
  PurchaseResponse,
} from "@/lib/types";
import { DENOMINATIONS, isCoin } from "@/lib/types";
import { ProductGrid } from "./ProductGrid";
import { ProductImage } from "./ProductImage";

type ModalStage = "transaction" | "confirmation";

export function VendingMachine() {
  const [products, setProducts] = useState<Product[]>([]);
  const [machineCash, setMachineCash] = useState<CashSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [transactionItem, setTransactionItem] = useState<Product | null>(null);
  const [inserted, setInserted] = useState<Record<number, number>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStage, setModalStage] = useState<ModalStage>("transaction");
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<PurchaseResponse | null>(null);

  const paid = useMemo(
    () =>
      Object.entries(inserted).reduce((acc, [d, c]) => acc + Number(d) * c, 0),
    [inserted],
  );

  const refresh = useCallback(async () => {
    setLoading(true);

    const [productsResult, cashResult] = await Promise.allSettled([
      api.listProducts(),
      api.listCash(),
    ]);

    if (productsResult.status === "fulfilled") {
      setProducts(productsResult.value);
      setPageError(null);
    } else {
      setPageError(
        productsResult.reason instanceof Error
          ? productsResult.reason.message
          : "Failed to load products",
      );
    }

    if (cashResult.status === "fulfilled") {
      setMachineCash(cashResult.value);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const insertDenomination = (d: Denomination) => {
    setInserted((cur) => ({ ...cur, [d]: (cur[d] ?? 0) + 1 }));
    setTransactionError(null);
  };

  const refundInserted = () => {
    if (paid === 0) return;
    setInserted({});
    setTransactionError(null);
  };

  const requiredMore = transactionItem
    ? Math.max(transactionItem.price - paid, 0)
    : 0;

  const changePreview = useMemo(() => {
    if (!transactionItem || requiredMore > 0) return null;
    const changeAmount = paid - transactionItem.price;
    const insertedBag = Object.fromEntries(
      Object.entries(inserted).map(([d, c]) => [Number(d), c]),
    );
    const preview = previewChangePlan(changeAmount, machineCash, insertedBag);
    return {
      amount: changeAmount,
      canMakeExact: preview !== null,
      slots: preview ?? [],
    };
  }, [inserted, machineCash, paid, requiredMore, transactionItem]);

  const openTransactionModal = (product: Product) => {
    setTransactionItem(product);
    setInserted({});
    setLastResult(null);
    setTransactionError(null);
    setModalStage("transaction");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (busy) return;
    setModalOpen(false);
    setModalStage("transaction");
    setTransactionItem(null);
    setInserted({});
    setTransactionError(null);
    setLastResult(null);
  };

  const submitPayment = async () => {
    if (!transactionItem) return;
    if (requiredMore > 0) {
      setTransactionError(`Need ${thb(requiredMore)} more`);
      return;
    }
    if (!changePreview || !changePreview.canMakeExact) {
      setTransactionError(
        "Machine cannot provide exact change for this payment.",
      );
      return;
    }

    setBusy(true);
    setTransactionError(null);
    try {
      const body = {
        product_id: transactionItem.id,
        inserted: Object.entries(inserted)
          .filter(([, c]) => c > 0)
          .map(([d, c]) => ({ denomination: Number(d), count: c })),
      };

      const res = await api.purchase(body);
      setLastResult(res);
      setInserted({});
      await refresh();
      setModalStage("confirmation");
    } catch (e) {
      setTransactionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const inStockCount = products.filter((p) => p.stock > 0).length;
  const outOfStockCount = products.length - inStockCount;

  return (
    <section className="glass-panel space-y-4 rounded-xl p-6 sm:p-8">
      <div className="rounded-xl border border-slate-200 bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#2057d5]">
              Transaction flow
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              Item Selection
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Click a product to open the payment modal.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded border border-[#95c9fb] bg-[#eff7ff] px-2.5 py-1 text-xs text-[#2057d5]">
              {products.length} total
            </span>
            <span className="rounded border border-[#d8f3e3] bg-[#effaf4] px-2.5 py-1 text-xs text-[#1e7d56]">
              {inStockCount} in stock
            </span>
            <span className="rounded border border-rose-100 bg-rose-50 px-2.5 py-1 text-xs text-rose-600">
              {outOfStockCount} out of stock
            </span>
          </div>
        </div>
      </div>

      {pageError && (
        <div className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {pageError}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-surface px-4 py-8 text-center text-sm text-slate-500">
          Loading products...
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-surface px-4 py-8 text-center text-sm text-slate-500">
          No products available.
        </div>
      ) : (
        <ProductGrid
          products={products}
          selectedId={transactionItem?.id ?? null}
          paid={0}
          showPaymentState={false}
          onSelect={openTransactionModal}
          disabled={busy}
        />
      )}

      {modalOpen && transactionItem && (
        <TransactionModal
          item={transactionItem}
          stage={modalStage}
          inserted={inserted}
          paid={paid}
          requiredMore={requiredMore}
          preview={changePreview}
          busy={busy}
          error={transactionError}
          lastResult={lastResult}
          onInsert={insertDenomination}
          onRefund={refundInserted}
          onConfirm={submitPayment}
          onClose={closeModal}
        />
      )}
    </section>
  );
}

function TransactionModal({
  item,
  stage,
  inserted,
  paid,
  requiredMore,
  preview,
  busy,
  error,
  lastResult,
  onInsert,
  onRefund,
  onConfirm,
  onClose,
}: {
  item: Product;
  stage: ModalStage;
  inserted: Record<number, number>;
  paid: number;
  requiredMore: number;
  preview: { amount: number; canMakeExact: boolean; slots: CashSlot[] } | null;
  busy: boolean;
  error: string | null;
  lastResult: PurchaseResponse | null;
  onInsert: (d: Denomination) => void;
  onRefund: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const groupedChange = lastResult ? groupCashSlots(lastResult.change) : null;
  const [changeOpen, setChangeOpen] = useState(true);

  const canSubmit =
    !busy && requiredMore === 0 && Boolean(preview && preview.canMakeExact);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  useEffect(() => {
    if (stage === "confirmation") {
      setChangeOpen(true);
    }
  }, [stage]);

  const modal = (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/30 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg items-start justify-center sm:items-center">
          <div className="w-full rounded-xl border border-slate-200 bg-surface p-6 shadow-sm">
            <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {stage === "transaction"
                    ? "Transaction"
                    : "Payment successful"}
                </h3>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {stage === "transaction" ? "Payment" : "Receipt"}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                aria-label="Close modal"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>
            {stage === "transaction" ? (
              <>
                <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-surface p-6 text-sm shadow-sm">
                  <ProductImage
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-40 w-full rounded-md border border-slate-200 object-cover"
                  />
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Item</span>
                    <span className="font-medium text-slate-900">
                      {item.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Price</span>
                    <span className="rounded bg-[#eff7ff] px-2 py-0.5 text-[#2057d5]">
                      {thb(item.price)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Remaining stock</span>
                    <span className="rounded bg-[#eff7ff] px-2 py-0.5 text-[#2057d5]">
                      {item.stock}
                    </span>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 bg-surface p-6 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">
                      Payment input
                    </h4>
                    <button
                      type="button"
                      onClick={onRefund}
                      disabled={busy || paid === 0}
                      className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      Refund input
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {DENOMINATIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => onInsert(d)}
                        disabled={busy}
                        className="rounded border border-[#3e8af3] bg-[#3e8af3] px-2 py-2 text-sm font-medium text-white transition hover:bg-[#286ce8] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <div>{thb(d)}</div>
                        {(inserted[d] ?? 0) > 0 && (
                          <div className="mt-1 inline-flex rounded bg-[#eff7ff] px-1.5 text-xs text-[#2057d5]">
                            x{inserted[d]}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-slate-500">Inserted total</span>
                    <span className="rounded bg-[#eff7ff] px-2 py-0.5 font-semibold text-[#2057d5]">
                      {thb(paid)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    {requiredMore > 0 ? (
                      <p className="mt-1 rounded bg-rose-50 px-2 py-1 text-sm font-medium text-rose-600">
                        Need {thb(requiredMore)} more.
                      </p>
                    ) : !preview || !preview.canMakeExact ? (
                      <p className="mt-1 rounded bg-rose-50 px-2 py-1 text-sm font-medium text-rose-600">
                        Machine cannot provide exact change for this payment.
                      </p>
                    ) : (
                      <p className="mt-1 flex w-full justify-between text-sm text-slate-500">
                        Expected change:{" "}
                        <span className="font-semibold text-[#1e7d56]">
                          {thb(preview.amount)}
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                {error && (
                  <p className="mt-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                    {error}
                  </p>
                )}

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={busy}
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onConfirm}
                    disabled={!canSubmit}
                    className="rounded-md bg-[#3e8af3] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#286ce8] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {busy ? "Processing..." : "Pay now"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-slate-500">
                  {lastResult
                    ? `Dispensed ${lastResult.product_name}.`
                    : "Transaction completed."}
                </p>

                {lastResult && (
                  <div className="mt-3 rounded-md border border-[#d8f3e3] bg-[#effaf4] p-3 text-sm text-[#1e7d56]">
                    <div className="flex items-center justify-between">
                      <span>Paid</span>
                      <span className="font-medium">
                        {thb(lastResult.paid)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span>Change returned</span>
                      <span className="font-semibold text-[#1e7d56]">
                        {thb(lastResult.change_amount)}
                      </span>
                    </div>
                  </div>
                )}

                <AccordionBlock
                  title="Your change breakdown"
                  open={changeOpen}
                  onToggle={() => setChangeOpen((cur) => !cur)}
                >
                  {!lastResult ||
                  lastResult.change.length === 0 ||
                  !groupedChange ? (
                    <p className="text-sm text-slate-500">
                      No change returned.
                    </p>
                  ) : (
                    <GroupedCashList
                      coins={groupedChange.coins}
                      banknotes={groupedChange.banknotes}
                      countClassName="text-[#1e7d56]"
                    />
                  )}
                </AccordionBlock>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md bg-[#3e8af3] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#286ce8]"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function AccordionBlock({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-3 rounded-xl border border-slate-200 bg-surface p-4 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <span
          className={`text-sm font-semibold ${
            open ? "text-slate-900" : "text-slate-900"
          }`}
        >
          {title}
        </span>
        {open ? (
          <FiChevronUp className="h-4 w-4 text-[#2057d5]" aria-hidden="true" />
        ) : (
          <FiChevronDown
            className="h-4 w-4 text-[#2057d5]"
            aria-hidden="true"
          />
        )}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
}

function GroupedCashList({
  coins,
  banknotes,
  countClassName,
}: {
  coins: CashSlot[];
  banknotes: CashSlot[];
  countClassName: string;
}) {
  return (
    <div className="space-y-3">
      <CashTypeGroup
        title="Coins"
        slots={coins}
        countClassName={countClassName}
      />
      <CashTypeGroup
        title="Banknotes"
        slots={banknotes}
        countClassName={countClassName}
      />
    </div>
  );
}

function CashTypeGroup({
  title,
  slots,
  countClassName,
}: {
  title: string;
  slots: CashSlot[];
  countClassName: string;
}) {
  return (
    <div>
      <p className="mb-1 px-2 text-xs uppercase tracking-wide text-slate-500">
        {title}
      </p>
      {slots.length === 0 ? (
        <p className="px-2 py-1 text-sm text-slate-500">None</p>
      ) : (
        <ul className="space-y-1 text-sm text-slate-900">
          {slots.map((slot) => (
            <li
              key={`${title}-${slot.denomination}`}
              className="flex items-center justify-between px-2 py-1"
            >
              <span>{thb(slot.denomination)}</span>
              <span className={`font-medium ${countClassName}`}>
                x{slot.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function groupCashSlots(slots: CashSlot[]) {
  const coins = slots
    .filter((slot) => slot.count > 0 && isCoin(slot.denomination))
    .sort((a, b) => b.denomination - a.denomination);
  const banknotes = slots
    .filter((slot) => slot.count > 0 && !isCoin(slot.denomination))
    .sort((a, b) => b.denomination - a.denomination);

  return { coins, banknotes };
}

function previewChangePlan(
  amount: number,
  machineCash: CashSlot[],
  inserted: Record<number, number>,
): CashSlot[] | null {
  if (amount < 0) return null;
  if (amount === 0) return [];

  const inventory: Record<number, number> = {};
  for (const slot of machineCash) {
    inventory[slot.denomination] = Math.max(0, slot.count);
  }
  for (const [d, c] of Object.entries(inserted)) {
    const denom = Number(d);
    inventory[denom] = (inventory[denom] ?? 0) + c;
  }

  const denoms = [...DENOMINATIONS].sort((a, b) => b - a);
  const plan = new Map<number, number>();

  const backtrack = (remaining: number, idx: number): boolean => {
    if (remaining === 0) return true;
    if (idx >= denoms.length) return false;

    const denom = denoms[idx];
    const available = inventory[denom] ?? 0;
    const maxTake = Math.min(available, Math.floor(remaining / denom));

    for (let take = maxTake; take >= 0; take -= 1) {
      if (take > 0) plan.set(denom, take);
      else plan.delete(denom);

      if (backtrack(remaining - denom * take, idx + 1)) {
        return true;
      }
    }

    plan.delete(denom);
    return false;
  };

  if (!backtrack(amount, 0)) return null;

  return [...plan.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[0] - a[0])
    .map(([denomination, count]) => ({ denomination, count }));
}
