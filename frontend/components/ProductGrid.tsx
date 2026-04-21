"use client";

import type { Product } from "@/lib/types";
import { thb } from "@/lib/format";
import { ProductImage } from "./ProductImage";

export function ProductGrid({
  products,
  selectedId,
  paid,
  showPaymentState = true,
  onSelect,
  disabled,
}: {
  products: Product[];
  selectedId: number | null;
  paid: number;
  showPaymentState?: boolean;
  onSelect: (p: Product) => void;
  disabled?: boolean;
}) {
  const useScrollLayout = products.length > 12;

  return (
    <div
      className={
        useScrollLayout ? "max-h-[68vh] overflow-y-auto pr-1" : undefined
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {products.map((p) => {
          const oos = p.stock <= 0;
          const underfunded = showPaymentState && paid < p.price;
          const isSelected = selectedId === p.id;
          const missing = Math.max(0, p.price - paid);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
              disabled={disabled || oos}
              aria-label={`Select ${p.name}`}
              aria-pressed={isSelected}
              className={`rounded-xl border bg-surface md:p-6 p-3 text-left shadow-sm transition
                ${
                  isSelected
                    ? "border-[#95c9fb] bg-[#eff7ff]"
                    : "border-slate-200 hover:border-[#95c9fb]"
                }
                ${
                  oos
                    ? "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-400 shadow-none"
                    : ""
                }
                ${underfunded && !oos ? "border-rose-100" : ""}
              `}
            >
              <ProductImage
                src={p.imageUrl}
                alt={p.name}
                className="h-32 w-full rounded-md border border-slate-200 object-cover"
              />
              <div className="mt-2 font-semibold text-slate-900">{p.name}</div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="rounded bg-[#eff7ff] px-2 py-0.5 text-sm font-medium text-[#2057d5]">
                  {thb(p.price)}
                </span>
                {oos ? (
                  <span className="rounded bg-rose-50 px-2 py-0.5 text-xs text-rose-600">
                    Out of stock
                  </span>
                ) : (
                  <span className="rounded bg-[#eff7ff] px-2 py-0.5 text-xs text-[#2057d5]">
                    {`${p.stock} left`}
                  </span>
                )}
              </div>
              {!oos && underfunded && (
                <p className="mt-2 inline-flex rounded bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">
                  Need +{thb(missing)}
                </p>
              )}
              {!oos && showPaymentState && !underfunded && (
                <p className="mt-2 inline-flex rounded bg-[#effaf4] px-2 py-0.5 text-xs font-medium text-[#1e7d56]">
                  Ready to buy
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
