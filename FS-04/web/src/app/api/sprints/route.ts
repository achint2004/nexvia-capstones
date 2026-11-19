import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const { organizationId, projectId, name, goal } = await req.json();
  const sprint = await prisma.sprint.create({
    data: {
      organizationId,
      projectId,
      name,
      goal: goal || '',
      status: 'PLANNING',
    },
  });
  return NextResponse.json(sprint);
}

export async function PATCH(req: NextRequest) {
  const { sprintId, organizationId, status } = await req.json();

  // Tenant isolation check
  const sprint = await prisma.sprint.findFirst({
    where: { id: sprintId, organizationId },
  });
  if (!sprint) return NextResponse.json({ error: 'Sprint not found in tenant' }, { status: 404 });

  if (status === 'ACTIVE') {
    // Ensure only one active sprint per project
    await prisma.sprint.updateMany({
      where: { projectId: sprint.projectId, organizationId, status: 'ACTIVE' },
      data: { status: 'COMPLETED', endDate: new Date() },
    });
  }

  if (status === 'COMPLETED') {
    // Move incomplete tasks back to backlog
    await prisma.task.updateMany({
      where: { sprintId, organizationId, status: { not: 'DONE' } },
      data: { sprintId: null },
    });
  }

  const updated = await prisma.sprint.update({
    where: { id: sprintId },
    data: {
      status,
      ...(status === 'ACTIVE' ? { startDate: new Date() } : {}),
      ...(status === 'COMPLETED' ? { endDate: new Date() } : {}),
    },
  });

  return NextResponse.json(updated);
}
