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
    // the key's account if resolution fails or the payer lacks capacity for
    // this batch; payerAddress is stored either way.
    const paidUserId = paymentFields.payerAddress
      ? await resolvePaidPinUserId(
          paymentFields.payerAddress,
          key.ipfsClusterId
        )
      : null;

    // Create or update pins and update user stats in a transaction
    const createdPins = await prisma.$transaction(async (tx) => {
      // What this batch adds for a given owner: pins that don't already exist
      // (or were deleted) for them
      const incomingFor = async (userId: string) => {
        const existingPins = await tx.pin.findMany({
          where: {
            userId,
            cid: { in: pins.map((p) => p.cid) },
            deletedAt: null,
          },
          select: { cid: true },
        });
        const existingCids = new Set(existingPins.map((p) => p.cid));
        let size = BigInt(0);
        for (const pin of pins) {
          if (!existingCids.has(pin.cid)) {
            size += BigInt(pin.size);
          }
        }
        return { count: pins.length - existingPins.length, size };
      };

      // Claim capacity on the payer's account with a conditional update that
      // counts THIS batch against the limits: atomic, so concurrent callbacks
      // can't overshoot, and a batch that doesn't fit falls back to the key's
      // account instead of blowing past sizeLimit.
      let pinOwnerId = key.userId;
      let statsApplied = false;
      if (paidUserId) {
        const payer = await tx.user.findUnique({
          where: { id: paidUserId },
          select: { pinLimit: true, sizeLimit: true },
        });
        if (payer) {
          const incoming = await incomingFor(paidUserId);
          const claimed = await tx.user.updateMany({
            where: {
              id: paidUserId,
              pinCount: { lte: payer.pinLimit - incoming.count },
              size: { lte: payer.sizeLimit - incoming.size },
            },
            data: {
              pinCount: { increment: incoming.count },
              size: { increment: incoming.size },
            },
          });
          if (claimed.count === 1) {
            pinOwnerId = paidUserId;
            statsApplied = true;
          }
        }
      }

      if (!statsApplied) {
        const incoming = await incomingFor(pinOwnerId);
        if (incoming.count > 0 || incoming.size > 0) {
          await tx.user.update({
            where: { id: pinOwnerId },
            data: {
              pinCount: { increment: incoming.count },
              size: { increment: incoming.size },
            },
          });
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