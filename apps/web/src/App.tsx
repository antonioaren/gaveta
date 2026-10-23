import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ShellLayout } from './layout/ShellLayout.tsx';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ShellLayout />} />
        <Route path="/nota/:ref" element={<ShellLayout />} />
      </Routes>
    </BrowserRouter>
  );
}
