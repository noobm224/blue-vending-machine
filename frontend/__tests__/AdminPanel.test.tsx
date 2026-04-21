import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { AdminPanel } from "@/components/AdminPanel";
import type { Product } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: {
    listProducts: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
    listCash: vi.fn(),
    setCash: vi.fn(),
    purchase: vi.fn(),
    listTransactions: vi.fn(),
  },
}));

import { api } from "@/lib/api";

const products: Product[] = [
  {
    id: 3,
    name: "Water",
    price: 15,
    stock: 1,
    imageUrl: "",
    created_at: "",
    updated_at: "",
  },
  {
    id: 1,
    name: "Cola",
    price: 25,
    stock: 5,
    imageUrl: "",
    created_at: "",
    updated_at: "",
  },
  {
    id: 2,
    name: "Tea",
    price: 20,
    stock: 0,
    imageUrl: "",
    created_at: "",
    updated_at: "",
  },
];

const transactionsPage = {
  items: [
    {
      id: 12,
      product_id: 1,
      product_name: "Cola",
      price: 25,
      paid: 50,
      change_amount: 25,
      created_at: "2026-04-20T11:20:00Z",
    },
  ],
  page: 1,
  page_size: 10,
  total_items: 1,
  total_pages: 1,
};

describe("AdminPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.listProducts).mockResolvedValue(products);
    vi.mocked(api.listCash).mockResolvedValue([]);
    vi.mocked(api.createProduct).mockResolvedValue({
      id: 4,
      name: "Fanta",
      price: 30,
      stock: 4,
      imageUrl: "https://img.test/fanta.png",
      created_at: "",
      updated_at: "",
    });
    vi.mocked(api.updateProduct).mockResolvedValue(products[0]);
    vi.mocked(api.deleteProduct).mockResolvedValue();
    vi.mocked(api.listTransactions).mockResolvedValue(transactionsPage);
  });

  it("defaults to ID sort and shows ID sort options", async () => {
    render(<AdminPanel />);

    await screen.findByText("Admin Workspace");

    expect(screen.getByDisplayValue("Sort: ID low-high")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Sort: ID high-low" }),
    ).toBeInTheDocument();

    const [table] = await screen.findAllByRole("table");
    const rows = within(table).getAllByRole("row");

    const firstDataCells = within(rows[1]).getAllByRole("cell");
    const secondDataCells = within(rows[2]).getAllByRole("cell");
    const thirdDataCells = within(rows[3]).getAllByRole("cell");

    expect(firstDataCells[0]).toHaveTextContent("1");
    expect(secondDataCells[0]).toHaveTextContent("2");
    expect(thirdDataCells[0]).toHaveTextContent("3");
  });

  it("closes add product modal with Escape", async () => {
    render(<AdminPanel />);

    await screen.findByText("Admin Workspace");

    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    fireEvent.click(screen.getByRole("button", { name: "Add product" }));

    expect(
      await screen.findByRole("heading", { name: "Add product" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Add product" }),
      ).not.toBeInTheDocument();
    });
  });

  it("uses app delete modal and closes it with Escape", async () => {
    render(<AdminPanel />);

    await screen.findByText("Admin Workspace");

    fireEvent.click(screen.getByRole("button", { name: "Manage" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);

    expect(
      await screen.findByRole("heading", { name: "Delete product" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Delete product" }),
      ).not.toBeInTheDocument();
    });

    expect(api.deleteProduct).not.toHaveBeenCalled();
  });

  it("deletes product after confirming in modal", async () => {
    render(<AdminPanel />);

    await screen.findByText("Admin Workspace");

    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);

    expect(
      await screen.findByRole("heading", { name: "Delete product" }),
    ).toBeInTheDocument();

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => {
      expect(api.deleteProduct).toHaveBeenCalledWith(1);
    });
  });

  it("creates product with trimmed inputs from modal", async () => {
    render(<AdminPanel />);

    await screen.findByText("Admin Workspace");

    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    fireEvent.click(screen.getByRole("button", { name: "Add product" }));

    const submitButtons = screen.getAllByRole("button", {
      name: "Add product",
    });
    const submitButton = submitButtons[submitButtons.length - 1];
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Product name"), {
      target: { value: "  Fanta  " },
    });
    fireEvent.change(screen.getByLabelText("Price"), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText("Stock"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Image URL"), {
      target: { value: "  https://img.test/fanta.png  " },
    });

    expect(submitButton).toBeEnabled();
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.createProduct).toHaveBeenCalledWith({
        name: "Fanta",
        price: 30,
        stock: 4,
        imageUrl: "https://img.test/fanta.png",
      });
    });
  });

  it("shows create error in add product modal", async () => {
    vi.mocked(api.createProduct).mockRejectedValueOnce(
      new Error("Create failed"),
    );

    render(<AdminPanel />);

    await screen.findByText("Admin Workspace");

    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    fireEvent.click(screen.getByRole("button", { name: "Add product" }));

    fireEvent.change(screen.getByLabelText("Product name"), {
      target: { value: "Juice" },
    });
    fireEvent.change(screen.getByLabelText("Price"), {
      target: { value: "35" },
    });
    fireEvent.change(screen.getByLabelText("Stock"), {
      target: { value: "2" },
    });

    const submitButtons = screen.getAllByRole("button", {
      name: "Add product",
    });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    expect(await screen.findByText("Create failed")).toBeInTheDocument();
  });

  it("enables save only after row changes and sends update payload", async () => {
    render(<AdminPanel />);

    await screen.findByText("Admin Workspace");
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));

    const [manageProductsTable] = screen.getAllByRole("table");
    const row = within(manageProductsTable).getByText("Cola").closest("tr");
    expect(row).not.toBeNull();

    const saveButton = within(row as HTMLTableRowElement).getByRole("button", {
      name: "Save",
    });
    expect(saveButton).toBeDisabled();

    const priceInput = within(row as HTMLTableRowElement).getAllByRole(
      "spinbutton",
    )[0];
    fireEvent.change(priceInput, { target: { value: "30" } });

    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.updateProduct).toHaveBeenCalledWith(1, {
        price: 30,
        stock: 5,
        imageUrl: "",
      });
    });
  });

  it("blocks save and shows invalid state for invalid row values", async () => {
    render(<AdminPanel />);

    await screen.findByText("Admin Workspace");
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));

    const [manageProductsTable] = screen.getAllByRole("table");
    const row = within(manageProductsTable).getByText("Cola").closest("tr");
    expect(row).not.toBeNull();

    const priceInput = within(row as HTMLTableRowElement).getAllByRole(
      "spinbutton",
    )[0];
    fireEvent.change(priceInput, { target: { value: "0" } });

    expect(
      within(row as HTMLTableRowElement).getByText("Invalid"),
    ).toBeInTheDocument();
    expect(
      within(row as HTMLTableRowElement).getByRole("button", { name: "Save" }),
    ).toBeDisabled();
  });

  it("resets edited row values back to original", async () => {
    render(<AdminPanel />);

    await screen.findByText("Admin Workspace");
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));

    const row = screen.getByText("Water").closest("tr");
    expect(row).not.toBeNull();

    const stockInput = within(row as HTMLTableRowElement).getAllByRole(
      "spinbutton",
    )[1];
    fireEvent.change(stockInput, { target: { value: "9" } });
    expect(stockInput).toHaveValue(9);

    fireEvent.click(
      within(row as HTMLTableRowElement).getByRole("button", { name: "Reset" }),
    );
    expect(stockInput).toHaveValue(1);
  });

  it("does not close delete modal with Escape while deleting", async () => {
    let resolveDelete: (() => void) | undefined;
    vi.mocked(api.deleteProduct).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = () => resolve();
        }),
    );

    render(<AdminPanel />);

    await screen.findByText("Admin Workspace");
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => {
      expect(api.deleteProduct).toHaveBeenCalledWith(1);
    });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.getByRole("heading", { name: "Delete product" }),
    ).toBeInTheDocument();

    if (!resolveDelete) {
      throw new Error("Delete resolver not initialized");
    }
    resolveDelete();
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Delete product" }),
      ).not.toBeInTheDocument();
    });
  });

  it("shows top-level error when admin data load fails", async () => {
    vi.mocked(api.listProducts).mockRejectedValueOnce(
      new Error("Products unavailable"),
    );

    render(<AdminPanel />);

    expect(await screen.findByText("Products unavailable")).toBeInTheDocument();
  });

  it("renders transaction logs table and item", async () => {
    render(<AdminPanel />);

    expect(await screen.findByText("Transaction Logs")).toBeInTheDocument();
    expect(screen.getByText("#12")).toBeInTheDocument();
    expect(api.listTransactions).toHaveBeenCalledWith(1, 10);
  });
});
