import type { KeyboardEvent } from "react";

/**
 * Arrow-key navigation for editable table grids.
 * Each <input> must have data-row and data-col attributes.
 *
 * ArrowUp/Down/Enter move between cells (column-wise).
 * ArrowLeft/Right are intentionally left to the browser so the cursor
 * moves within the text — Tab/Shift+Tab navigate horizontally instead.
 */
export function handleGridKeyDown(e: KeyboardEvent<HTMLInputElement>) {
  const { key } = e;
  if (!["ArrowUp", "ArrowDown", "Enter"].includes(key)) return;

  // Always prevent default so number inputs don't increment/decrement.
  e.preventDefault();

  const input = e.currentTarget;
  const table = input.closest("table");
  if (!table) return;

  const allInputs = Array.from(
    table.querySelectorAll<HTMLInputElement>("input[data-row][data-col]")
  );

  const col = parseInt(input.dataset.col!);

  const sameCol = allInputs
    .filter((i) => parseInt(i.dataset.col!) === col)
    .sort((a, b) => parseInt(a.dataset.row!) - parseInt(b.dataset.row!));
  const idx = sameCol.findIndex((i) => i === input);
  const dir = key === "ArrowUp" ? -1 : 1;

  const target = sameCol[idx + dir] ?? null;
  if (target) {
    target.focus();
    target.select();
  }
}
