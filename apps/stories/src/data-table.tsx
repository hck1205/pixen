/**
 * One table, described rather than built.
 *
 * Six pages had hand-written `<table>` markup that differed only in what went
 * in the cells — and the duplication scan counted the closing rows before a
 * person did. Describing the columns instead means a page says what it is
 * showing, and how a table looks is decided once.
 */
import { fixedTable, tableCell, tableHeader, wideTable } from "./styles.js";
import type { CSSProperties, ReactNode } from "react";

export interface Column<Row> {
  header: string;
  /** A share of the table, for the tables that set `fixed`. */
  width?: string;
  cell: (row: Row) => ReactNode;
  /** Anything the cell needs beyond the default — monospace, no wrapping, weight. */
  style?: CSSProperties;
}

export interface DataTableProps<Row> {
  columns: ReadonlyArray<Column<Row>>;
  rows: readonly Row[];
  /** Stable per row; the index is a last resort, not a default. */
  keyOf: (row: Row, index: number) => string;
  /**
   * Proportions the columns by the widths above rather than by the browser's
   * guess, which hands the width to whichever cell holds the longest word.
   */
  fixed?: boolean;
}

export function DataTable<Row>({ columns, rows, keyOf, fixed = false }: DataTableProps<Row>) {
  return (
    <table style={fixed ? fixedTable : wideTable}>
      {fixed && (
        <colgroup>
          {columns.map((column) => (
            <col key={column.header} style={column.width ? { width: column.width } : {}} />
          ))}
        </colgroup>
      )}
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.header} style={tableHeader}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={keyOf(row, index)}>
            {columns.map((column) => (
              <td key={column.header} style={{ ...tableCell, ...column.style }}>
                {column.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
