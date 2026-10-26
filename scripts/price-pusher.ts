/**
 * Local stand-in for the Pyth price service: re-publishes every mock feed on an
 * interval so reserves never trip the staleness guard. Optional random walk on
 * jitoSOL makes the dashboard and keeper move.
 *
 *   npm run pusher             # republish every 10s
 *   npm run pusher -- --walk   # plus a ±1.5% random walk on jitoSOL
 *   npm run pusher -- --once
 */
import { PublicKey } from "@solana/web3.js";
import { client, deployment, log } from "../keeper/common.js";

const ONCE = process.argv.includes("--once");
const WALK = process.argv.includes("--walk");
const INTERVAL_MS = Number(process.env.PUSH_MS ?? 10_000);

async function push() {
  for (const [name, r] of Object.entries(deployment.reserves)) {
    const feed = new PublicKey(r.feed);
    const acc = await client.program.account.mockPrice.fetch(feed);
    let price = Number(acc.price.toString()) / 10 ** -acc.expo;
    if (WALK && name === "jitoSOL") price *= 1 + (Math.random() - 0.5) * 0.03;
    await client.setMockPrice(feed, price, { expo: acc.expo });
  }
  log("pusher", `published ${Object.keys(deployment.reserves).length} feeds`);
}

await push();
if (!ONCE) setInterval(() => push().catch((e) => log("pusher", `error: ${e}`)), INTERVAL_MS);
