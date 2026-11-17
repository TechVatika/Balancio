import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth.jsx";
import { BookProvider } from "./book.jsx";
import { AuthGate } from "./components/AuthGate.jsx";
import { Shell } from "./components/Shell.jsx";
import { Account } from "./pages/Account.jsx";
import { Activity } from "./pages/Activity.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { Ledger } from "./pages/Ledger.jsx";
import { NotFound } from "./pages/NotFound.jsx";
import { Reports } from "./pages/Reports.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate>
          <BookProvider>
            <Routes>
              <Route element={<Shell />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/month" element={<Ledger mode="month" />} />
                <Route path="/year" element={<Ledger mode="year" />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/activity" element={<Activity />} />
                <Route path="/account" element={<Account />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BookProvider>
        </AuthGate>
      </AuthProvider>
    </BrowserRouter>
  );
}
