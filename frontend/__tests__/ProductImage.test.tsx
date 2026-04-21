import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProductImage } from "@/components/ProductImage";

describe("ProductImage", () => {
  it("uses placeholder when image URL is empty", () => {
    render(<ProductImage src="" alt="Empty image" />);

    const image = screen.getByAltText("Empty image") as HTMLImageElement;
    expect(image.src).toContain("/product-placeholder.svg");
  });

  it("falls back to placeholder when image fails to load", () => {
    render(
      <ProductImage
        src="https://example.com/missing-image.png"
        alt="Broken image"
      />,
    );

    const image = screen.getByAltText("Broken image") as HTMLImageElement;
    fireEvent.error(image);

    expect(image.src).toContain("/product-placeholder.svg");
  });
});
