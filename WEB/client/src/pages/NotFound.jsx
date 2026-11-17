import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

export function NotFound() {
  const location = useLocation();

  useEffect(() => {
    document.title = "Page not found · Balancio";
  }, []);

  return (
    <main className="not-found-screen">
      <div className="not-found-card">
        <img className="not-found-logo" src="/logo.png" alt="" />
        <p className="not-found__code" aria-hidden="true">404</p>
        <h1 className="not-found__title">Page not found</h1>
        <p className="not-found__text">
          There is no page at <code>{location.pathname}</code>.
          Check the address, or return to the home ledger.
        </p>
        <Link to="/" className="btn not-found__home">
          Go to home
        </Link>
      </div>
    </main>
  );
}
