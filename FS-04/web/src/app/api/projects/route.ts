import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const { organizationId, name, key, description } = await req.json();

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { projects: true },
  });
  if (!org) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  // SaaS Plan Enforcement: FREE tier allows max 2 projects
  if (org.plan === 'FREE' && org.projects.length >= 2) {
    return NextResponse.json(
      { error: 'FREE plan limit reached (max 2 projects). Upgrade to PRO for unlimited projects.' },
      { status: 403 }
    );
  }

  const project = await prisma.project.create({
    data: {
      organizationId,
      name,
      key: (key || name.slice(0, 3)).toUpperCase(),
      description: description || '',
    },
    include: { sprints: true, tasks: { include: { assignee: true } } },
  });

  return NextResponse.json(project);
}
