import Link from "next/link";

export default function CheckoutSuccessPage() {
  return <main className="container"><section className="form-card"><p className="eyebrow">Payment received</p><h1>Your checkout is complete</h1><p className="muted">Stripe has returned successfully. EventFlow confirms the order from the verified webhook and will place your tickets in the dashboard shortly.</p><div className="actions"><Link className="button" href="/dashboard">Open my tickets</Link><Link className="button secondary" href="/">Discover more events</Link></div></section></main>;
}
