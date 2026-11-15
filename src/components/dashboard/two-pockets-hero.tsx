import { ChevronRight, Swap, TriangleAlert } from "@/components/app-icon";
import { AppLink as Link } from "@/components/app-link";
import { CurrencyToggle } from "@/components/currency-toggle";
import { MoneyAmount } from "@/components/money-amount";
import type { CurrencyPocketsSummary, NetWorthSummary } from "@/lib/domain/accounts";
import { formatMoney, fromMajor, isZero, type CurrencyCode, type Money } from "@/lib/money";
import { describeFreshness, type RateSnapshot } from "@/lib/rates/repository";

export function TwoPocketsHero({
  netWorth,
  netWorthEquivalent,
  pockets,
  snapshot,
  displayCurrency,
}: {
  netWorth: NetWorthSummary;
  netWorthEquivalent: Money;
  pockets: CurrencyPocketsSummary;
  snapshot: RateSnapshot;
  displayCurrency: CurrencyCode;
}) {
  const needsAttention = snapshot.freshness === "stale" || snapshot.freshness === "fallback";
  const perDollar = formatMoney(fromMajor(snapshot.rate.rate, "KHR"));

  return (
    <section className="hero-panel order-1 lg:order-none" aria-label="Two pockets summary">
      <div className="hero-top">
        <span className="hero-label">Everything you have</span>
        <CurrencyToggle current={displayCurrency} variant="hero" />
      </div>

      <div className="hero-total-wrap">
        <div className="hero-figure">
          <MoneyAmount amount={netWorth.netWorth} />
        </div>
        <div className="hero-sub">
          ~ <MoneyAmount amount={netWorthEquivalent} /> at today&apos;s rate
        </div>
      </div>

      <div
        className="pocket-bar"
        role="img"
        aria-label={`Dollars ${pockets.usd.sharePercent} percent, Riel ${pockets.khr.sharePercent} percent`}
      >
        <div
          className="pocket-seg pocket-seg-usd"
          style={{ width: `${pockets.usd.sharePercent}%` }}
        />
        <div
          className="pocket-seg pocket-seg-khr"
          style={{ width: `${pockets.khr.sharePercent}%` }}
        />
      </div>

      <div className="pocket-tiles">
        <Link href="/accounts" className="pocket-tile">
          <span className="pocket-tile-head">
            <span className="dot dot-usd" aria-hidden="true" />
            <span>Dollars</span>
          </span>
          <span className="pocket-tile-val">
            <MoneyAmount amount={pockets.usd.subtotal} />
          </span>
          <span className="pocket-tile-cap">
            {pockets.usd.count} {pockets.usd.count === 1 ? "account" : "accounts"},{" "}
            {pockets.usd.sharePercent}%
          </span>
        </Link>

        <Link href="/accounts" className="pocket-tile">
          <span className="pocket-tile-head">
            <span className="dot dot-khr" aria-hidden="true" />
            <span>Riel</span>
          </span>
          <span className="pocket-tile-val">
            <MoneyAmount amount={pockets.khr.subtotal} />
          </span>
          <span className="pocket-tile-cap">
            {pockets.khr.count} {pockets.khr.count === 1 ? "account" : "accounts"},{" "}
            {pockets.khr.sharePercent}%
          </span>
        </Link>
      </div>

      {!isZero(netWorth.liabilities) ? (
        <p className="hero-liabilities">
          Owed <MoneyAmount amount={netWorth.liabilities} />
        </p>
      ) : null}

      <div className="hero-rate-wrap">
        {needsAttention ? (
          <Link href="/settings" className="hero-rate-stale">
            <span className="hero-rate-stale-left">
              <TriangleAlert size={18} aria-hidden="true" className="shrink-0" />
              <span>
                {snapshot.freshness === "fallback"
                  ? "No published rate yet. Totals may be off."
                  : `Rate is ${snapshot.ageDays} days old. Totals may be off.`}
              </span>
            </span>
            <span className="hero-rate-stale-act">Set your own rate</span>
          </Link>
        ) : (
          <Link href="/settings" className="hero-rate-btn">
            <span className="hero-rate-left">
              <Swap size={16} aria-hidden="true" className="shrink-0" />
              <span className="hero-rate-val font-num">$1 = {perDollar}</span>
              <span className="hero-rate-meta">{describeFreshness(snapshot)}</span>
            </span>
            <ChevronRight size={16} aria-hidden="true" className="shrink-0" />
          </Link>
        )}
      </div>
    </section>
  );
}
