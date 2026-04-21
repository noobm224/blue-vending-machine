import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VendingMachine } from "@/components/VendingMachine";
import type { Product, PurchaseResponse } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: {
    listProducts: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
    listCash: vi.fn(),
    setCash: vi.fn(),
    purchase: vi.fn(),
  },
}));

import { api } from "@/lib/api";

const products: Product[] = [
  {
    id: 1,
    name: "Cola",
    price: 25,
    stock: 10,
    imageUrl: "",
    created_at: "",
    updated_at: "",
  },
  {
    id: 2,
    name: "Water",
    price: 15,
    stock: 3,
    imageUrl: "",
    created_at: "",
    updated_at: "",
  },
  {
    id: 3,
    name: "Tea",
    price: 20,
    stock: 0,
    imageUrl: "",
    created_at: "",
    updated_at: "",
  },
];

describe("VendingMachine", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.listProducts).mockResolvedValue(products);
    vi.mocked(api.listCash).mockResolvedValue([]);
    vi.mocked(api.purchase).mockResolvedValue({
      product_id: 1,
      product_name: "Cola",
      price: 25,
      paid: 25,
      change_amount: 0,
      change: [],
      remaining_stock: 9,
    });
  });

  it("shows total, in-stock, and out-of-stock counts", async () => {
    render(<VendingMachine />);

    expect(await screen.findByText("3 total")).toBeInTheDocument();
    expect(screen.getByText("2 in stock")).toBeInTheDocument();
    expect(screen.getByText("1 out of stock")).toBeInTheDocument();
  });

  it("opens payment modal when a product is clicked", async () => {
    render(<VendingMachine />);

    fireEvent.click(await screen.findByLabelText("Select Cola"));

    expect(
      await screen.findByRole("heading", { name: "Transaction" }),
    ).toBeInTheDocument();
  });

  it("closes transaction modal with Escape", async () => {
    render(<VendingMachine />);

    fireEvent.click(await screen.findByLabelText("Select Cola"));
    expect(
      await screen.findByRole("heading", { name: "Transaction" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Transaction" }),
      ).not.toBeInTheDocument();
    });
  });

  it("shows remaining amount message when inserted money is insufficient", async () => {
    render(<VendingMachine />);

    fireEvent.click(await screen.findByLabelText("Select Cola"));
    expect(await screen.findByText("Need 25 THB more.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /20 THB/i }));
    expect(screen.getByText("Need 5 THB more.")).toBeInTheDocument();
  });

  it("completes purchase and closes on Done", async () => {
    render(<VendingMachine />);

    fireEvent.click(await screen.findByLabelText("Select Cola"));
    fireEvent.click(screen.getByRole("button", { name: /20 THB/i }));
    fireEvent.click(screen.getByRole("button", { name: /5 THB/i }));

    fireEvent.click(screen.getByRole("button", { name: "Pay now" }));

    expect(
      await screen.findByRole("heading", { name: "Payment successful" }),
    ).toBeInTheDocument();

    expect(api.purchase).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(api.purchase).mock.calls[0][0];
    expect(payload.product_id).toBe(1);
    expect(payload.inserted).toEqual(
      expect.arrayContaining([
        { denomination: 5, count: 1 },
        { denomination: 20, count: 1 },
      ]),
    );
    expect(payload.inserted).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Payment successful" }),
      ).not.toBeInTheDocument();
    });
  });

  it("shows purchase error when API call fails", async () => {
    vi.mocked(api.purchase).mockRejectedValueOnce(new Error("Purchase failed"));

    render(<VendingMachine />);

    fireEvent.click(await screen.findByLabelText("Select Cola"));
    fireEvent.click(screen.getByRole("button", { name: /20 THB/i }));
    fireEvent.click(screen.getByRole("button", { name: /5 THB/i }));
    fireEvent.click(screen.getByRole("button", { name: "Pay now" }));

    expect(await screen.findByText("Purchase failed")).toBeInTheDocument();
  });

  it("does not close transaction modal with Escape while processing", async () => {
    let resolvePurchase: ((value: PurchaseResponse) => void) | undefined;

    vi.mocked(api.purchase).mockImplementationOnce(
      () =>
        new Promise<PurchaseResponse>((resolve) => {
          resolvePurchase = (value) => resolve(value);
        }),
    );

    render(<VendingMachine />);

    fireEvent.click(await screen.findByLabelText("Select Cola"));
    fireEvent.click(screen.getByRole("button", { name: /20 THB/i }));
    fireEvent.click(screen.getByRole("button", { name: /5 THB/i }));
    fireEvent.click(screen.getByRole("button", { name: "Pay now" }));

    expect(
      screen.getByRole("button", { name: "Processing..." }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.getByRole("heading", { name: "Transaction" }),
    ).toBeInTheDocument();

    if (!resolvePurchase) {
      throw new Error("Purchase resolver not initialized");
    }

    resolvePurchase({
      product_id: 1,
      product_name: "Cola",
      price: 25,
      paid: 25,
      change_amount: 0,
      change: [],
      remaining_stock: 9,
    });

    expect(
      await screen.findByRole("heading", { name: "Payment successful" }),
    ).toBeInTheDocument();
  });

  it("shows product load error", async () => {
    vi.mocked(api.listProducts).mockRejectedValueOnce(
      new Error("Failed to load products"),
    );

    render(<VendingMachine />);

    expect(
      await screen.findByText("Failed to load products"),
    ).toBeInTheDocument();
  });

  it("does not show machine reserves section in confirmation", async () => {
    render(<VendingMachine />);

    fireEvent.click(await screen.findByLabelText("Select Cola"));
    fireEvent.click(screen.getByRole("button", { name: /20 THB/i }));
    fireEvent.click(screen.getByRole("button", { name: /5 THB/i }));
    fireEvent.click(screen.getByRole("button", { name: "Pay now" }));

    expect(
      await screen.findByRole("heading", { name: "Payment successful" }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: /Machine current change reserves/i,
      }),
    ).not.toBeInTheDocument();
  });
});
