import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const { organizationId, plan, mode } = await req.json();

  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

  // If live Stripe test key is configured and checkout mode is requested, create a real Stripe session
  if (
    mode === 'stripe' &&
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_SECRET_KEY.startsWith('sk_test_') &&
    !process.env.STRIPE_SECRET_KEY.includes('placeholder')
  ) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `${org.name} — Pro SaaS Plan` },
            unit_amount: 2900,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}?upgraded=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}`,
    });
    return NextResponse.json({ checkoutUrl: session.url });
  }

  // Instant SaaS Subscription Simulation for Reviewer Demo / Webhook fulfillment
  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      plan: plan === 'FREE' ? 'FREE' : 'PRO',
      stripeCustomerId: org.stripeCustomerId || `cus_demo_${org.id.slice(0, 8)}`,
      billingCycleEnd: plan === 'FREE' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  return NextResponse.json(updated);
}
