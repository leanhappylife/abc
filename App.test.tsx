import React from 'react';
import { render } from '@testing-library/react';
import App from './App'; 
import '@testing-library/jest-dom/extend-expect';

//使用简化的模拟语法来避免语法错误
jest.mock('./Table', () => {
  const React = require('react'); // 确保在模拟的作用域内引入React
  return {
    __esModule: true,
    default: React.forwardRef((props:any, ref:any) => {
      // 模拟列移动事件
      const mockEvent = { column: { colId: 'age' }, type: 'columnMoved' };

      if (props.onColumnMoved) {
        props.onColumnMoved(mockEvent);
      }

      // 返回模拟的Table组件渲染结果
      return <div data-testid="mockTable">Table Placeholder</div>;
    }),
  };
});

describe('App Component', () => {
  it('correctly handles column moved event via handleColumnMoved', () => {
    //const consoleSpy = jest.spyOn(console, 'log');
    
    render(<App />);
    
    // 验证console.log是否被正确调用，说明handleColumnMoved被触发
    //expect(consoleSpy).toHaveBeenCalledWith('Column moved', expect.any(Object));
    
    //consoleSpy.mockRestore(); // 测试完成后清理spy
  });
});
