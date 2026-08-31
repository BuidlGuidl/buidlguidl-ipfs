// One-off backfill: mirror Privy-linked Ethereum wallet addresses into
// user_wallets for users created before the mirror existed. Safe to re-run
// (skips users that already have mirrored wallets).
//
// Usage (from packages/website, after `prisma generate` and `prisma db push`):
//   pnpm dlx tsx --env-file=.env scripts/backfill-user-wallets.ts [--dry-run]
import { prisma } from "../app/lib/prisma";
import {
  addUserWallets,
  ethAddresses,
  privyClient,
} from "../app/lib/privy-wallet";

const dryRun = process.argv.includes("--dry-run");
const privy = privyClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { wallets: { none: {} } },
    select: { id: true },
  });
  console.log(
    `${users.length} users without mirrored wallets${dryRun ? " (dry run)" : ""}`
  );

  let mirrored = 0;
  let skipped = 0;
  for (const [i, user] of users.entries()) {
    try {
      const addresses = ethAddresses(await privy.getUser(user.id));
      if (addresses.length === 0) {
        skipped++;
        console.log(`  ${user.id}: no ethereum wallets`);
      } else {
        if (!dryRun) await addUserWallets(user.id, addresses);
        mirrored++;
        console.log(`  ${user.id}: ${addresses.join(", ")}`);
      }
    } catch (error) {
      skipped++;
      console.error(
        `  ${user.id}: FAILED - ${error instanceof Error ? error.message : error}`
      );
    }
    // Stay well under Privy's ~500 req / 10s rate limit
    if ((i + 1) % 50 === 0) await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`Done: ${mirrored} users mirrored, ${skipped} skipped/failed`);
  await prisma.$disconnect();
}

main();
