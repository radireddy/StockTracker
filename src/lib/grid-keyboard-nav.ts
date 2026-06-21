import type { KeyboardEvent } from "react";

/**
 * Arrow-key navigation for editable table grids.
 * Each <input> must have data-row and data-col attributes.
 * Supports: ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Enter (moves down).
 */
export function handleGridKeyDown(e: KeyboardEvent<HTMLInputElement>) {
  const { key } = e;
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(key)) return;

  const input = e.currentTarget;
  const table = input.closest("table");
  if (!table) return;

  const allInputs = Array.from(
    table.querySelectorAll<HTMLInputElement>("input[data-row][data-col]")
  );

  const col = parseInt(input.dataset.col!);
  const row = parseInt(input.dataset.row!);

  let target: HTMLInputElement | null = null;

  if (key === "ArrowUp" || key === "ArrowDown" || key === "Enter") {
    const sameCol = allInputs
      .filter((i) => parseInt(i.dataset.col!) === col)
      .sort((a, b) => parseInt(a.dataset.row!) - parseInt(b.dataset.row!));
    const idx = sameCol.findIndex((i) => i === input);
    const dir = key === "ArrowUp" ? -1 : 1;
    if (idx + dir >= 0 && idx + dir < sameCol.length) {
      target = sameCol[idx + dir];
    }
  } else {
    const sameRow = allInputs
      .filter((i) => parseInt(i.dataset.row!) === row)
      .sort((a, b) => parseInt(a.dataset.col!) - parseInt(b.dataset.col!));
    const idx = sameRow.findIndex((i) => i === input);
    const dir = key === "ArrowLeft" ? -1 : 1;
    if (idx + dir >= 0 && idx + dir < sameRow.length) {
      target = sameRow[idx + dir];
    }
  }

  if (target) {
    e.preventDefault();
    target.focus();
    target.select();
  }
}
