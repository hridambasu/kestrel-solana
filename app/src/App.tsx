import { useCallback, useEffect, useState } from "react";
import { loadSnapshot, type ObligationRow, type Snapshot } from "./data";

const usd = (x: number) => `$${x.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;

const HF_MIN = 0.8;
const HF_MAX = 2.2;
const xOf = (hf: number) => ((Math.min(Math.max(hf, HF_MIN), HF_MAX) - HF_MIN) / (HF_MAX - HF_MIN)) * 100;

function tone(hf: number) {
  if (hf < 1) return "danger";
  if (hf < 1.15) return "warn";
  return "ok";
}

/**
 * Every borrower on one axis: distance from the liquidation line is the whole story.
 * Marker area scales with debt so the positions that matter most are the ones you see.
 */
function HealthLadder({ obligations }: { obligations: ObligationRow[] }) {
  const maxDebt = Math.max(1, ...obligations.map((o) => o.debt));
  const ticks = [0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2];
  return (
    <figure className="ladder" aria-label="Borrowers by health factor">
      <div className="ladder-track">
        <div className="ladder-zone" style={{ width: `${xOf(1)}%` }} />
        <div className="ladder-line" style={{ left: `${xOf(1)}%` }}>
          <span>Liquidation at 1.00</span>
        </div>
        {obligations.map((o, i) => {
          const size = 14 + Math.sqrt(o.debt / maxDebt) * 34;
          return (
            <div
              key={o.address}
              className={`ladder-dot ${tone(o.healthFactor)}`}
              style={{ left: `${xOf(o.healthFactor)}%`, top: `${28 + (i % 3) * 26}%`, width: size, height: size }}
              title={`${o.label}: health ${o.healthFactor.toFixed(3)}, debt ${usd(o.debt)}`}
            >
              <span className="ladder-label">
                {o.label} <b>{o.healthFactor.toFixed(2)}</b>
              </span>
            </div>
          );
        })}
      </div>
      <div className="ladder-axis" aria-hidden>
        {ticks.map((t) => (
          <span key={t} style={{ left: `${xOf(t)}%` }}>{t.toFixed(1)}</span>
        ))}
      </div>
      <figcaption>
        Each dot is a borrower, placed by health factor and sized by debt. Anything left of the line can be liquidated now.
      </figcaption>
    </figure>
  );
}

export default function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnap(await loadSnapshot());
      setError(null);
    } catch (e) {
      console.error(e);
      setError("Can't read the market. Start the local validator, run `npm run seed`, then reload.");
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  if (error) return <main className="shell"><p className="error">{error}</p></main>;
  if (!snap) return <main className="shell"><p className="muted">Reading the market…</p></main>;

  const atRisk = snap.obligations.filter((o) => o.healthFactor < 1.15);
  const liquidatable = snap.obligations.filter((o) => o.healthFactor < 1);
  const totalDebt = snap.obligations.reduce((a, o) => a + o.debt, 0);
  const stale = snap.reserves.some((r) => r.updatedAgo > 60);

  return (
    <main className="shell">
      <header className="top">
        <h1>Kestrel</h1>
        <p className="lede">
          {liquidatable.length > 0
            ? `${liquidatable.length} borrower${liquidatable.length > 1 ? "s are" : " is"} below the liquidation line right now.`
            : atRisk.length > 0
              ? `${atRisk.length} borrower${atRisk.length > 1 ? "s are" : " is"} within 15% of liquidation. Nothing is liquidatable yet.`
              : "Every borrower is comfortably above the liquidation line."}{" "}
          {usd(totalDebt)} borrowed across {snap.obligations.length} positions.
        </p>
      </header>

      <HealthLadder obligations={snap.obligations} />
      {stale && <p className="notice">Prices are over a minute old. Run the price pusher (npm run pusher) and the keeper (npm run keeper) to keep reserves fresh.</p>}

      <section aria-labelledby="pos-h">
        <h2 id="pos-h">Positions</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Borrower</th>
                <th scope="col">Collateral</th>
                <th scope="col">Debt</th>
                <th scope="col" className="num">Collateral value</th>
                <th scope="col" className="num">Risk-weighted debt</th>
                <th scope="col" className="num">Health</th>
              </tr>
            </thead>
            <tbody>
              {snap.obligations.map((o) => (
                <tr key={o.address}>
                  <th scope="row">
                    {o.label}
                    {o.eMode > 0 && <span className="tag">eMode {o.eMode}</span>}
                  </th>
                  <td>{o.collateralAssets.join(", ")}</td>
                  <td>{o.debtAssets.join(", ")}</td>
                  <td className="num">{usd(o.collateral)}</td>
                  <td className="num">{usd(o.debt)}</td>
                  <td className="num"><span className={`hf ${tone(o.healthFactor)}`}>{o.healthFactor.toFixed(3)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="split">
        <section aria-labelledby="res-h">
          <h2 id="res-h">Reserves</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Asset</th>
                  <th scope="col" className="num">Price</th>
                  <th scope="col" className="num">Supplied</th>
                  <th scope="col" className="num">Utilisation</th>
                  <th scope="col" className="num">Borrow APR</th>
                  <th scope="col" className="num">Supply APR</th>
                  <th scope="col" className="num">LTV / liq.</th>
                </tr>
              </thead>
              <tbody>
                {snap.reserves.map((r) => (
                  <tr key={r.address}>
                    <th scope="row">
                      {r.name}
                      {r.permissioned && <span className="tag tag-rwa" title="Deposits and liquidations need a compliance credential">Credential required</span>}
                    </th>
                    <td className="num">{r.price.toFixed(2)}</td>
                    <td className="num">{usd(r.supplied)}</td>
                    <td className="num">{r.borrowEnabled ? pct(r.utilization, 1) : "Collateral only"}</td>
                    <td className="num">{r.borrowEnabled ? pct(r.borrowApr) : "–"}</td>
                    <td className="num">{r.borrowEnabled ? pct(r.supplyApr) : "–"}</td>
                    <td className="num">{pct(r.ltv, 0)} / {pct(r.liquidationThreshold, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {snap.eModeGroups.map((g) => (
            <p key={g.id} className="muted small">
              eMode {g.id}: positions holding only {snap.reserves.filter((r) => r.eMode === g.id).map((r) => r.name).join(" and ")} borrow up to{" "}
              {pct(g.ltv, 0)} and are liquidated at {pct(g.threshold, 0)}.
            </p>
          ))}
        </section>

        <aside className="vault" aria-labelledby="vault-h">
          <h2 id="vault-h">USDC Prime vault</h2>
          <dl>
            <div><dt>Assets</dt><dd>{usd(snap.vault.aum)}</dd></div>
            <div><dt>Share price</dt><dd>{snap.vault.sharePrice.toFixed(6)}</dd></div>
            <div><dt>Held back for withdrawals</dt><dd>{usd(snap.vault.idle)}</dd></div>
          </dl>
          {snap.vault.allocations.map((a) => (
            <div key={a.name} className="cap">
              <div className="cap-head">
                <span>Lent to {a.name}</span>
                <span>{usd(a.value)} of {usd(a.cap)} cap</span>
              </div>
              <div className="cap-bar" role="meter" aria-valuemin={0} aria-valuemax={a.cap} aria-valuenow={a.value} aria-label={`${a.name} allocation`}>
                <div style={{ width: `${Math.min(100, (a.value / Math.max(a.cap, 1)) * 100)}%` }} />
              </div>
              <p className="muted small">Earning {pct(a.supplyApr)} before the 10% performance fee.</p>
            </div>
          ))}
        </aside>
      </div>
      <footer className="muted small">Slot {snap.slot}. Refreshes every 5 seconds.</footer>
    </main>
  );
}
