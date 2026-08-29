// One-off backfill: mirror Privy-linked Ethereum wallet addresses into
// user_wallets for existing users. Safe to re-run (skips mirrored users).
//
// Usage (from packages/website, after `prisma generate` and `prisma db push`):
//   node --env-file=.env scripts/backfill-user-wallets.mjs [--dry-run]
import { PrismaClient } from "@prisma/client";
import { PrivyClient } from "@privy-io/server-auth";

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient();
const privy = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID,
  process.env.PRIVY_APP_SECRET
);

const users = await prisma.user.findMany({
  where: { wallets: { none: {} } },
  select: { id: true },
});
console.log(`${users.length} users without mirrored wallets${dryRun ? " (dry run)" : ""}`);

let mirrored = 0;
let skipped = 0;
for (const [i, user] of users.entries()) {
  try {
    const privyUser = await privy.getUser(user.id);
    const addresses = privyUser.linkedAccounts
      .filter((a) => a.type === "wallet" && a.chainType === "ethereum")
      .map((a) => a.address.toLowerCase());
    if (addresses.length === 0) {
      skipped++;
      console.log(`  ${user.id}: no ethereum wallets`);
    } else {
      if (!dryRun) {
        await prisma.userWallet.createMany({
          data: addresses.map((address) => ({ address, userId: user.id })),
          skipDuplicates: true,
        });
      }
      mirrored++;
      console.log(`  ${user.id}: ${addresses.join(", ")}`);
    }
  } catch (error) {
    skipped++;
    console.error(`  ${user.id}: FAILED - ${error.message}`);
  }
  // Stay well under Privy's ~500 req / 10s rate limit
  if ((i + 1) % 50 === 0) await new Promise((r) => setTimeout(r, 2000));
}

console.log(`Done: ${mirrored} users mirrored, ${skipped} skipped/failed`);
await prisma.$disconnect();
