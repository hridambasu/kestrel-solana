/** Demo: drop jitoSOL by N% (default 12) to push the risky obligation under water.  npm run crash -- 12 */
import { PublicKey } from "@solana/web3.js";
import { client, deployment, log } from "../keeper/common.js";

const pct = Number(process.argv[2] ?? "12");
const feed = new PublicKey(deployment.reserves.jitoSOL.feed);
const acc = await client.program.account.mockPrice.fetch(feed);
const current = Number(acc.price.toString()) / 10 ** -acc.expo;
const next = current * (1 - pct / 100);
await client.setMockPrice(feed, next);
log("crash", `jitoSOL ${current.toFixed(2)} -> ${next.toFixed(2)} (-${pct}%)`);
