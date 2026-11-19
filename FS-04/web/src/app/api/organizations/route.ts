import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Fetch isolated tenant workspace data
export async function GET(req: NextRequest) {
  const organizationId = req.nextUrl.searchParams.get('organizationId');
  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      members: { include: { user: true } },
      projects: {
        orderBy: { createdAt: 'asc' },
        include: {
          sprints: { orderBy: { createdAt: 'asc' } },
          tasks: {
            include: { assignee: true },
            orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          },
        },
      },
    },
  });

  if (!org) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  return NextResponse.json(org);
}

// Create a brand new isolated tenant workspace OR invite member
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action === 'INVITE_MEMBER') {
    const { organizationId, email, name, role } = body;
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { members: true },
    });
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    // SaaS Plan Enforcement: FREE tier allows max 3 members
    if (org.plan === 'FREE' && org.members.length >= 3) {
      return NextResponse.json(
        { error: 'FREE plan limit reached (max 3 members). Upgrade to PRO for unlimited seats.' },
        { status: 403 }
      );
    }

    const invitedUser = await prisma.user.upsert({
      where: { email: email.toLowerCase().trim() },
      update: {},
      create: { email: email.toLowerCase().trim(), name: name || email.split('@')[0] },
    });

    const member = await prisma.organizationMember.upsert({
      where: { userId_organizationId: { userId: invitedUser.id, organizationId } },
      update: { role: role || 'MEMBER' },
      create: { userId: invitedUser.id, organizationId, role: role || 'MEMBER' },
      include: { user: true },
    });

    return NextResponse.json(member);
  }

  // Create new tenant organization
  const { name, userId } = body;
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Math.floor(100 + Math.random() * 900)}`;
  const org = await prisma.organization.create({
    data: {
      name,
      slug,
      plan: 'FREE',
      members: { create: { userId, role: 'OWNER' } },
    },
  });

  return NextResponse.json({ ...org, role: 'OWNER' });
}
