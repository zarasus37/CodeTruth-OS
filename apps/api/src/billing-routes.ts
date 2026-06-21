import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import type { SubscriptionPlan } from "@codetruth/core";
import { assertFeature, BillingGateError, getPlanDefinition, listPublicPlans } from "@codetruth/billing";
import { authenticate } from "./auth.js";
import {
  getBillingSummary,
  getOrCreateSubscription,
} from "./billing-service.js";
import { store } from "./context.js";
import { requireWorkspaceAccess } from "./rbac.js";

function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:4310";
}

function priceIdForPlan(plan: SubscriptionPlan, interval: "month" | "year"): string | undefined {
  const definition = getPlanDefinition(plan);
  if (plan === "pro") {
    return interval === "year"
      ? definition.pricing.stripePriceYearly
      : definition.pricing.stripePriceMonthly;
  }
  if (plan === "team" && interval === "month") {
    return definition.pricing.stripePriceTeamMonthly;
  }
  return undefined;
}

export async function registerBillingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/billing/plans", async () => ({
    plans: listPublicPlans().map((plan) => ({
      id: plan.id,
      name: plan.name,
      tagline: plan.tagline,
      pricing: plan.pricing,
      limits: plan.limits,
      features: plan.features,
    })),
  }));

  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/billing",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "workspace:manage",
      );
      if (!member) return;
      return getBillingSummary(request.params.workspaceId);
    },
  );

  app.post<{
    Params: { workspaceId: string };
    Body: { plan?: SubscriptionPlan; interval?: "month" | "year" };
  }>(
    "/workspaces/:workspaceId/billing/checkout",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "workspace:manage",
      );
      if (!member) return;

      const stripe = stripeClient();
      if (!stripe) {
        return reply.code(503).send({ error: "Stripe is not configured" });
      }

      const plan = request.body?.plan ?? "pro";
      const interval = request.body?.interval ?? "month";
      if (plan !== "pro" && plan !== "team") {
        return reply.code(400).send({ error: "Only pro and team plans are self-serve" });
      }

      const priceId = priceIdForPlan(plan, interval);
      if (!priceId) {
        return reply.code(503).send({ error: `Stripe price not configured for ${plan}/${interval}` });
      }

      const subscription = await getOrCreateSubscription(request.params.workspaceId);
      let customerId = subscription.stripeCustomerId;

      if (!customerId) {
        const user = request.user!;
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.displayName,
          metadata: {
            workspaceId: request.params.workspaceId,
            userId: user.id,
          },
        });
        customerId = customer.id;
        await store.saveWorkspaceSubscription({
          ...subscription,
          stripeCustomerId: customerId,
          updatedAt: new Date().toISOString(),
        });
      }

      const teamSeats =
        plan === "team" ? getPlanDefinition("team").limits.seatsIncluded : 1;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: teamSeats }],
        success_url: `${appUrl()}/?billing=success&workspace=${request.params.workspaceId}`,
        cancel_url: `${appUrl()}/?billing=cancel&workspace=${request.params.workspaceId}`,
        metadata: {
          workspaceId: request.params.workspaceId,
          plan,
        },
        subscription_data: {
          metadata: {
            workspaceId: request.params.workspaceId,
            plan,
          },
        },
      });

      return { checkoutUrl: session.url, sessionId: session.id };
    },
  );

  app.post<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/billing/portal",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "workspace:manage",
      );
      if (!member) return;

      const stripe = stripeClient();
      if (!stripe) {
        return reply.code(503).send({ error: "Stripe is not configured" });
      }

      const subscription = await getOrCreateSubscription(request.params.workspaceId);
      if (!subscription.stripeCustomerId) {
        return reply.code(400).send({ error: "No Stripe customer for this workspace" });
      }

      const portal = await stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: `${appUrl()}/?workspace=${request.params.workspaceId}`,
      });

      return { portalUrl: portal.url };
    },
  );

  app.post("/webhooks/stripe", async (request, reply) => {
    const stripe = stripeClient();
    if (!stripe) return reply.code(503).send({ error: "Stripe is not configured" });

    const signature = request.headers["stripe-signature"];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!signature || !secret || !request.rawBody) {
      return reply.code(400).send({ error: "Missing Stripe webhook signature" });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        request.rawBody,
        typeof signature === "string" ? signature : signature[0]!,
        secret,
      );
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Invalid webhook signature",
      });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspaceId;
      const plan = (session.metadata?.plan as SubscriptionPlan | undefined) ?? "pro";
      if (workspaceId && session.subscription) {
        const current = await getOrCreateSubscription(workspaceId);
        const seatsIncluded = plan === "team" ? getPlanDefinition("team").limits.seatsIncluded : undefined;
        await store.saveWorkspaceSubscription({
          ...current,
          plan,
          status: "active",
          stripeCustomerId: typeof session.customer === "string" ? session.customer : current.stripeCustomerId,
          stripeSubscriptionId:
            typeof session.subscription === "string" ? session.subscription : current.stripeSubscriptionId,
          seatCount: seatsIncluded ?? current.seatCount,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const workspaceId = sub.metadata?.workspaceId;
      if (workspaceId) {
        const current = await getOrCreateSubscription(workspaceId);
        const plan = (sub.metadata?.plan as SubscriptionPlan | undefined) ?? current.plan;
        const status =
          event.type === "customer.subscription.deleted"
            ? "canceled"
            : sub.status === "trialing"
              ? "trialing"
              : sub.status === "past_due"
                ? "past_due"
                : sub.status === "active"
                  ? "active"
                  : "incomplete";

        await store.saveWorkspaceSubscription({
          ...current,
          plan: status === "canceled" ? "free" : plan,
          status,
          stripeSubscriptionId: sub.id,
          stripeCustomerId:
            typeof sub.customer === "string" ? sub.customer : current.stripeCustomerId,
          currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
          seatCount: plan === "team" ? sub.items.data[0]?.quantity ?? 5 : current.seatCount,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return { received: true };
  });

  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/seats",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "workspace:manage",
      );
      if (!member) return;
      const summary = await getBillingSummary(request.params.workspaceId);
      return { seats: summary.seats, subscription: summary.subscription, plan: summary.plan };
    },
  );

  app.post<{
    Params: { workspaceId: string };
    Body: { targetSeatCount?: number };
  }>(
    "/workspaces/:workspaceId/billing/seats",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "workspace:manage",
      );
      if (!member) return;

      const subscription = await getOrCreateSubscription(request.params.workspaceId);
      try {
        assertFeature(subscription, "team_seats");
      } catch (error) {
        if (error instanceof BillingGateError) {
          return reply.code(402).send({
            error: error.message,
            code: error.code,
            upgradePlan: error.upgradePlan,
          });
        }
        throw error;
      }

      const plan = getPlanDefinition(subscription.plan);
      const members = await store.listWorkspaceMembers(request.params.workspaceId);
      const targetSeatCount = request.body?.targetSeatCount;
      if (!targetSeatCount || !Number.isFinite(targetSeatCount)) {
        return reply.code(400).send({ error: "targetSeatCount is required" });
      }

      if (targetSeatCount < plan.limits.seatsIncluded) {
        return reply.code(400).send({
          error: `Team plan includes ${plan.limits.seatsIncluded} seats minimum`,
        });
      }
      if (targetSeatCount > plan.limits.maxSeats) {
        return reply.code(400).send({ error: `Maximum ${plan.limits.maxSeats} seats on ${plan.id}` });
      }
      if (targetSeatCount < members.length) {
        return reply.code(400).send({
          error: `Cannot set seats below current member count (${members.length})`,
        });
      }

      const stripe = stripeClient();
      if (stripe && subscription.stripeSubscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
        const item = sub.items.data[0];
        if (!item) {
          return reply.code(503).send({ error: "Stripe subscription has no billable item" });
        }
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          items: [{ id: item.id, quantity: targetSeatCount }],
          proration_behavior: "create_prorations",
        });
      }

      await store.saveWorkspaceSubscription({
        ...subscription,
        seatCount: targetSeatCount,
        updatedAt: new Date().toISOString(),
      });

      const summary = await getBillingSummary(request.params.workspaceId);
      return { seats: summary.seats, subscription: summary.subscription };
    },
  );
}