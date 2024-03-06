// Table.tsx
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import './App.css';

interface TableRowData {
  [key: string]: any;
}

export interface TableMethods {
  extractCsv: () => string;
  reset: () => void;
  setFilter: (model: any) => void;
  setQuickFilter: (text: string) => void;
  getColumnDefs: () => any[];
  isColumnFilterPresent: () => boolean;
  deselectAll: () => void;
  getSelectedRows: () => any[];
}

interface TableProps {
  className?: string;
  rowData: TableRowData[];
  columnDefs: any[];
  onColumnMoved?: (event: any) => void; // Added the onColumnMoved callback prop
}

const Table = forwardRef<TableMethods, TableProps>(({
  className,
  rowData,
  columnDefs,
  onColumnMoved, // Destructured the onColumnMoved from props
}, ref) => {
  const gridRef = useRef<AgGridReact>(null);

  useImperativeHandle(ref, () => ({
    extractCsv: () => {
      const csvString = gridRef.current?.api.getDataAsCsv() || '';
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'export.csv');
      document.body.appendChild(link); // Required for FF
      link.click(); // This will download the file
      document.body.removeChild(link); // Clean up
      return '';
    },
    reset: () => {
      if (gridRef.current) {
        gridRef.current.api.setFilterModel(null);
      }
    },
    setFilter: (model: any) => {
      if (gridRef.current) {
        gridRef.current.api.setFilterModel(model);
      }
    },
    setQuickFilter: (text: string) => {
      if (gridRef.current) {
        gridRef.current.api.setQuickFilter(text);
      }
    },
    getColumnDefs: () => {
      return gridRef.current?.api.getColumnDefs() ?? [];
    },
    isColumnFilterPresent: () => {
      return gridRef.current ? gridRef.current.api.isAnyFilterPresent() : false;
    },
    deselectAll: () => {
      if (gridRef.current) {
        gridRef.current.api.deselectAll();
      }
    },
    getSelectedRows: () => {
      return gridRef.current ? gridRef.current.api.getSelectedRows() : [];
    },
  }));

  return (
    <div className={`ag-theme-alpine-dark ${className}`} style={{ height: 600, width: '100%' }}>
      <AgGridReact
        ref={gridRef}
        rowData={rowData}
        columnDefs={columnDefs}
        onColumnMoved={onColumnMoved} // Passed the onColumnMoved prop to the AgGridReact component
      />
    </div>
  );
});

export default Table;
