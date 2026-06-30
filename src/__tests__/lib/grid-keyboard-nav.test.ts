import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleGridKeyDown } from "@/lib/grid-keyboard-nav";

function createMockTable() {
  const table = document.createElement("table");
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  const inputs: HTMLInputElement[] = [];

  for (let row = 0; row < 3; row++) {
    const tr = document.createElement("tr");
    for (let col = 0; col < 3; col++) {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.setAttribute("data-row", String(row));
      input.setAttribute("data-col", String(col));
      input.focus = vi.fn();
      input.select = vi.fn();
      td.appendChild(input);
      tr.appendChild(td);
      inputs.push(input);
    }
    tbody.appendChild(tr);
  }

  document.body.appendChild(table);
  return { table, inputs };
}

function makeKeyboardEvent(
  input: HTMLInputElement,
  key: string
): { key: string; currentTarget: HTMLInputElement; preventDefault: () => void } {
  return {
    key,
    currentTarget: input,
    preventDefault: vi.fn(),
  };
}

describe("handleGridKeyDown", () => {
  let inputs: HTMLInputElement[];

  beforeEach(() => {
    document.body.innerHTML = "";
    const result = createMockTable();
    inputs = result.inputs;
  });

  it("moves down on ArrowDown", () => {
    const event = makeKeyboardEvent(inputs[1], "ArrowDown"); // row 0, col 1
    handleGridKeyDown(event as any);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(inputs[4].focus).toHaveBeenCalled(); // row 1, col 1
    expect(inputs[4].select).toHaveBeenCalled();
  });

  it("moves up on ArrowUp", () => {
    const event = makeKeyboardEvent(inputs[4], "ArrowUp"); // row 1, col 1
    handleGridKeyDown(event as any);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(inputs[1].focus).toHaveBeenCalled(); // row 0, col 1
  });

  it("moves right on ArrowRight", () => {
    const event = makeKeyboardEvent(inputs[0], "ArrowRight"); // row 0, col 0
    handleGridKeyDown(event as any);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(inputs[1].focus).toHaveBeenCalled(); // row 0, col 1
  });

  it("moves left on ArrowLeft", () => {
    const event = makeKeyboardEvent(inputs[1], "ArrowLeft"); // row 0, col 1
    handleGridKeyDown(event as any);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(inputs[0].focus).toHaveBeenCalled(); // row 0, col 0
  });

  it("moves down on Enter", () => {
    const event = makeKeyboardEvent(inputs[1], "Enter"); // row 0, col 1
    handleGridKeyDown(event as any);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(inputs[4].focus).toHaveBeenCalled(); // row 1, col 1
  });

  it("does nothing for non-arrow keys", () => {
    const event = makeKeyboardEvent(inputs[0], "Tab");
    handleGridKeyDown(event as any);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does not move past top boundary", () => {
    const event = makeKeyboardEvent(inputs[0], "ArrowUp"); // row 0, col 0
    handleGridKeyDown(event as any);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does not move past bottom boundary", () => {
    const event = makeKeyboardEvent(inputs[8], "ArrowDown"); // row 2, col 2
    handleGridKeyDown(event as any);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does not move past left boundary", () => {
    const event = makeKeyboardEvent(inputs[0], "ArrowLeft"); // row 0, col 0
    handleGridKeyDown(event as any);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does not move past right boundary", () => {
    const event = makeKeyboardEvent(inputs[2], "ArrowRight"); // row 0, col 2
    handleGridKeyDown(event as any);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does nothing when not inside a table", () => {
    const input = document.createElement("input");
    input.setAttribute("data-row", "0");
    input.setAttribute("data-col", "0");
    document.body.appendChild(input);
    const event = makeKeyboardEvent(input, "ArrowDown");
    handleGridKeyDown(event as any);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
