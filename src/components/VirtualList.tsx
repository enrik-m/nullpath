/**
 * Thin wrapper over react-window's `List` that renders items as a flat
 * scrollable column with a fixed row height. Used by the Codex view
 * (and anywhere else that may grow into hundreds of rows).
 *
 * Only mounts the rows that fit in the viewport plus a small overscan
 * — at 1,000+ items the browser otherwise pegs on layout / paint.
 *
 * Pattern note: at small list sizes the virtualization overhead is a
 * net loss (constant resize-observer + height math). The
 * `<MaybeVirtualList>` companion below renders the children as a plain
 * column under a configurable threshold and flips to virtualized only
 * when the row count justifies it.
 */

import type { ReactElement } from "react";
import { List, type RowComponentProps } from "react-window";

interface VirtualListProps<T> {
  items: T[];
  /** Pixel height of every row. Items must be a fixed height for now. */
  rowHeight: number;
  /** Pixel height of the scrollable viewport. */
  height: number;
  /**
   * Renders one row. The row gets `index` and the typed `item` plus the
   * style react-window injects for absolute positioning — that style
   * MUST be spread onto the outermost element of the row, otherwise
   * positioning breaks.
   */
  children: (args: { index: number; item: T; style: React.CSSProperties }) => ReactElement;
  /** Items rendered above and below the visible window. Default 4. */
  overscanCount?: number;
  className?: string;
}

export function VirtualList<T>({
  items,
  rowHeight,
  height,
  children,
  overscanCount = 4,
  className,
}: VirtualListProps<T>) {
  // react-window 2.x calls this with `index`, `style`, and any props we
  // forward through `rowProps`. We forward the items array there so the
  // row component can index into it without closing over a captured
  // reference (which would defeat memoization).
  type RowProps = { items: T[]; renderRow: VirtualListProps<T>["children"] };
  function RowComp({ index, style, items: list, renderRow }: RowComponentProps<RowProps>) {
    const item = list[index];
    if (item === undefined) return null;
    return renderRow({ index, item, style });
  }

  return (
    <div className={className} style={{ height, width: "100%" }}>
      <List<RowProps>
        rowCount={items.length}
        rowHeight={rowHeight}
        rowComponent={RowComp}
        rowProps={{ items, renderRow: children }}
        overscanCount={overscanCount}
        style={{ height, width: "100%" }}
      />
    </div>
  );
}

/**
 * Renders as a plain column when below the threshold, virtualized list
 * above it. Spares the overhead of react-window for the typical small
 * collection while still scaling to thousands.
 */
export function MaybeVirtualList<T>({
  items,
  rowHeight,
  height,
  threshold = 100,
  children,
  className,
}: VirtualListProps<T> & { threshold?: number }) {
  if (items.length < threshold) {
    return (
      <div className={className}>
        {items.map((item, index) => children({ index, item, style: {} }))}
      </div>
    );
  }
  return (
    <VirtualList items={items} rowHeight={rowHeight} height={height} className={className}>
      {children}
    </VirtualList>
  );
}
