import React, { useState, useEffect } from 'react';

function DataDashboard() {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    // Memory leak: setInterval without cleanup
    const interval = setInterval(() => {
      fetch('/api/data')
        .then(res => res.json())
        .then(newData => setData(prev => [...prev, ...newData]));
    }, 1000);
    // Missing: return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Memory leak: event listener never removed
    const handler = (e: Event) => {
      console.log('resize', e);
      setData([]);
    };
    window.addEventListener('resize', handler);
    // Missing: return () => window.removeEventListener('resize', handler);
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      <div dangerouslySetInnerHTML={{ __html: data.toString() }} />
      {data.map((item, i) => (
        <div key={i}>{JSON.stringify(item)}</div>
      ))}
    </div>
  );
}

export default DataDashboard;
