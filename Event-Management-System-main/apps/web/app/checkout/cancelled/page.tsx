import Link from "next/link";

export default function CheckoutCancelledPage() {
  return <main className="container"><section className="form-card"><p className="eyebrow">Checkout cancelled</p><h1>Your order was not completed</h1><p className="muted">No ticket is issued until payment is confirmed. Any temporary inventory hold will expire automatically if it is not completed.</p><div className="actions"><Link className="button" href="/">Return to events</Link><Link className="button secondary" href="/dashboard">View my orders</Link></div></section></main>;
}
