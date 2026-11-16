import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth.jsx";
import { BookProvider } from "./book.jsx";
import { AuthGate } from "./components/AuthGate.jsx";
import { Shell } from "./components/Shell.jsx";
import { Account } from "./pages/Account.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { Ledger } from "./pages/Ledger.jsx";
import { Reports } from "./pages/Reports.jsx";

function Missing() {
  return (
    <section className="panel empty-page">
      <p className="eyebrow">Balancio</p>
      <h1>That page is not in the book.</h1>
      <Link to="/" className="text-link">Back to the overview</Link>
    </section>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate>
          <BookProvider>
            <Shell>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/month" element={<Ledger mode="month" />} />
                <Route path="/year" element={<Ledger mode="year" />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/account" element={<Account />} />
                <Route path="*" element={<Missing />} />
              </Routes>
            </Shell>
          </BookProvider>
        </AuthGate>
      </AuthProvider>
    </BrowserRouter>
  );
}
