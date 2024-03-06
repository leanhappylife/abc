import React, { useRef } from 'react';
import Table, { TableMethods } from './Table'; // Adjust the import path as necessary
import './App.css'; // Assuming default styling, modify as needed

interface TableRow {
  id: number;
  name: string;
  age: number;
}

const App: React.FC = () => {
  const tableRef = useRef<TableMethods>(null);

  const rowData: TableRow[] = [
    { id: 1, name: 'John Doe', age: 30 },
    { id: 2, name: 'Jane Doe', age: 25 },
    // Add more row data as needed
  ];

  const columnDefs = [
    { headerName: 'ID', field: 'id' },
    { headerName: 'Name', field: 'name' },
    { headerName: 'Age', field: 'age' },
    // Define more columns as needed
  ];

  // Define the onColumnMoved handler
  const handleColumnMoved = (event: any) => {
    console.log('Column moved', event);
    // Implement any specific logic you need when a column is moved
  };

  const onButtonClick = () => {
    tableRef.current?.extractCsv();
  };

  return (
    <div>
      <button onClick={onButtonClick}>Export CSV</button>
      <Table
        ref={tableRef}
        className="my-custom-class"
        rowData={rowData}
        columnDefs={columnDefs}
        onColumnMoved={handleColumnMoved} // Pass the onColumnMoved function as a prop
      />
    </div>
  );
};

export default App;
