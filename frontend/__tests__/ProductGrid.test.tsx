import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProductGrid } from "@/components/ProductGrid";
import type { Product } from "@/lib/types";

const mk = (over: Partial<Product> = {}): Product => ({
  id: 1,
  name: "Coke",
  price: 25,
  stock: 5,
  imageUrl: "",
  created_at: "",
  updated_at: "",
  ...over,
});

describe("ProductGrid", () => {
  it("disables out-of-stock products", () => {
    const onSelect = vi.fn();
    render(
      <ProductGrid
        products={[mk({ name: "Coke", stock: 0 })]}
        selectedId={null}
        paid={100}
        onSelect={onSelect}
      />,
    );
    const btn = screen.getByLabelText("Select Coke");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("selects a product on click", () => {
    const onSelect = vi.fn();
    const p = mk({ name: "Water", id: 3 });
    render(
      <ProductGrid
        products={[p]}
        selectedId={null}
        paid={0}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByLabelText("Select Water"));
    expect(onSelect).toHaveBeenCalledWith(p);
  });
});
