import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import {
  verifyApiKey,
  verifyWorkerAuth,
  handleRouteError,
} from "@/app/lib/api-auth";
import { resolvePaidPinUserId } from "@/app/lib/privy-wallet";

export async function POST(request: NextRequest) {
  try {
    verifyWorkerAuth(request);

    const { apiKey, pins, payment } = await request.json();
    if (!apiKey || !Array.isArray(pins)) {
      throw new Error("Bad request");
    }

    // Optional payment metadata from the worker's paid (MPP/x402) upload path
    const paymentFields: {
      payerAddress?: string | null;
      paymentReference?: string | null;
      paymentNetwork?: string | null;
      paymentAmount?: string | null;
    } = payment
      ? {
          payerAddress: payment.payerAddress ?? null,
          paymentReference: payment.reference ?? null,
          paymentNetwork: payment.network ?? null,
          paymentAmount: payment.amount ?? null,
        }
      : {};

    const key = await verifyApiKey(apiKey);

    // Paid pins: attribute to the payer's account (resolved via the wallet
    // mirror / Privy) instead of the worker's default account. Falls back to
    // the key's account if resolution fails or the payer is at their limits;
    // payerAddress is stored either way.
    let pinOwnerId = key.userId;
    if (paymentFields.payerAddress) {
      const paidUserId = await resolvePaidPinUserId(
        paymentFields.payerAddress,
        key.ipfsClusterId
      );
      if (paidUserId) {
        const payer = await prisma.user.findUnique({
          where: { id: paidUserId },
          select: {
            pinCount: true,
            pinLimit: true,
            size: true,
            sizeLimit: true,
          },
        });
        if (
          payer &&
          payer.pinCount < payer.pinLimit &&
          payer.size < payer.sizeLimit
        ) {
          pinOwnerId = paidUserId;
        }
      }
    }

    // Create or update pins and update user stats in a transaction
    const createdPins = await prisma.$transaction(async (tx) => {
      // Calculate total new size from pins that don't exist or were deleted
      let totalNewSize = BigInt(0);
      const existingPins = await tx.pin.findMany({
        where: {
          userId: pinOwnerId,
          cid: {
            in: pins.map((p) => p.cid),
          },
          deletedAt: null,
        },
        select: {
          cid: true,
          size: true,
        },
      });

      const existingCids = new Set(existingPins.map((p) => p.cid));

      // Sum up sizes of new or previously deleted pins
      for (const pin of pins) {
        if (!existingCids.has(pin.cid)) {
          totalNewSize += BigInt(pin.size);
        }
      }

      // Create or update pins
      const upsertedPins = await Promise.all(
        pins.map(({ cid, size, name }) =>
          tx.pin.upsert({
            where: {
              userId_cid: {
                userId: pinOwnerId,
                cid,
              },
            },
            create: {
              userId: pinOwnerId,
              cid,
              size: BigInt(size),
              name,
              ipfsClusterId: key.ipfsClusterId,
              ...paymentFields,
            },
            update: {
              size: BigInt(size),
              name,
              deletedAt: null, // Restore if it was deleted
              ...paymentFields,
            },
          })
        )
      );

      // Update user stats if we have new pins
      if (totalNewSize > 0) {
        await tx.user.update({
          where: { id: pinOwnerId },
          data: {
            pinCount: {
              increment: pins.length - existingPins.length,
            },
            size: {
              increment: totalNewSize,
            },
          },
        });
      }

      return upsertedPins;
    });

    // Serialize BigInts to strings before returning
    const serializedPins = createdPins.map((pin) => ({
      ...pin,
      size: pin.size.toString(),
    }));

    return NextResponse.json(serializedPins);
  } catch (error) {
    return handleRouteError(error, "create pins");
  }
} 