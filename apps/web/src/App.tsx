import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from './i18n/I18nProvider.tsx';
import { ShellLayout } from './layout/ShellLayout.tsx';

export function App() {
  return (
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ShellLayout />} />
          <Route path="/nota/:ref" element={<ShellLayout />} />
          <Route path="/grafo" element={<ShellLayout />} />
          <Route path="/tareas" element={<ShellLayout />} />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  );
}
