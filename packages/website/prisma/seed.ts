import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create default IPFS cluster if it doesn't exist
  const defaultCluster = await prisma.ipfsCluster.upsert({
    where: { id: "community" },
    update: {},
    create: {
      id: "community",
      name: "Community",
      apiUrl: "http://localhost:5555",
      gatewayUrl: "http://localhost:8080",
    },
  });

  console.log({ defaultCluster });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 