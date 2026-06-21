import { createId, type SubscriptionPlan } from "@codetruth/core";
import { store } from "./context.js";
import { getOrCreateSubscription } from "./billing-service.js";
import { isBetaModeEnabled, trackEvent } from "./telemetry-service.js";

export class BetaAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BetaAccessError";
  }
}

export async function redeemBetaInvite(input: {
  userId: string;
  code: string;
  workspaceId?: string;
}) {
  if (!isBetaModeEnabled()) {
    throw new BetaAccessError("Closed beta is not enabled");
  }

  const existing = await store.listBetaRedemptions(input.userId);
  if (existing.length > 0) {
    throw new BetaAccessError("Beta invite already redeemed for this account");
  }

  const invite = await store.getBetaInviteByCode(input.code);
  if (!invite) {
    throw new BetaAccessError("Invalid beta invite code");
  }
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
    throw new BetaAccessError("Beta invite has expired");
  }
  if (invite.redemptionCount >= invite.maxRedemptions) {
    throw new BetaAccessError("Beta invite has no remaining redemptions");
  }

  const now = new Date().toISOString();
  await store.setUserBetaAccess(input.userId, invite.code, now);
  await store.saveBetaRedemption({
    id: createId("beta"),
    inviteId: invite.id,
    userId: input.userId,
    workspaceId: input.workspaceId,
    redeemedAt: now,
  });

  invite.redemptionCount += 1;
  await store.saveBetaInvite(invite);

  if (input.workspaceId) {
    const subscription = await getOrCreateSubscription(input.workspaceId);
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + invite.trialDays);
    await store.saveWorkspaceSubscription({
      ...subscription,
      plan: invite.grantsPlan,
      status: "trialing",
      currentPeriodEnd: trialEnd.toISOString(),
      updatedAt: now,
    });
  }

  await trackEvent("beta.invite_redeemed", {
    userId: input.userId,
    workspaceId: input.workspaceId,
    properties: {
      code: invite.code,
      grantsPlan: invite.grantsPlan,
      trialDays: invite.trialDays,
    },
  });

  return {
    invite: {
      code: invite.code,
      label: invite.label,
      grantsPlan: invite.grantsPlan,
      trialDays: invite.trialDays,
    },
    betaAccessAt: now,
  };
}

export async function ensureDefaultBetaInvite(): Promise<void> {
  const code = process.env.BETA_DEFAULT_INVITE_CODE?.trim().toUpperCase();
  if (!code) return;

  const existing = await store.getBetaInviteByCode(code);
  if (existing) return;

  await store.saveBetaInvite({
    id: createId("binv"),
    code,
    label: "Default closed-beta cohort",
    maxRedemptions: Number(process.env.BETA_DEFAULT_INVITE_MAX ?? 50),
    redemptionCount: 0,
    grantsPlan: (process.env.BETA_DEFAULT_GRANTS_PLAN as SubscriptionPlan) ?? "pro",
    trialDays: Number(process.env.BETA_DEFAULT_TRIAL_DAYS ?? 45),
    createdAt: new Date().toISOString(),
  });
}