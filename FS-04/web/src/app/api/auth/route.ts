import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { email, name } = await req.json();
    if (!email || !name) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const user = await prisma.user.upsert({
      where: { email: email.toLowerCase().trim() },
      update: { name: name.trim() },
      create: { email: email.toLowerCase().trim(), name: name.trim() },
    });

    // Check if user already belongs to any organization
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.id },
      include: { organization: true },
    });

    if (memberships.length === 0) {
      const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Math.floor(100 + Math.random() * 900)}`;
      const org = await prisma.organization.create({
        data: {
          name: `${name.split(' ')[0]}'s Workspace`,
          slug,
          plan: 'FREE',
          members: {
            create: { userId: user.id, role: 'OWNER' },
          },
        },
      });

      const project = await prisma.project.create({
        data: {
          name: 'Core Platform Launch',
          key: 'CPL',
          description: 'Initial product roadmap and sprint board',
          organizationId: org.id,
        },
      });

      const sprint = await prisma.sprint.create({
        data: {
          name: 'Sprint 1 — MVP Foundations',
          goal: 'Ship multi-tenant auth and Kanban board',
          status: 'ACTIVE',
          projectId: project.id,
          organizationId: org.id,
        },
      });

      await prisma.task.createMany({
        data: [
          {
            title: 'Set up tenant isolation middleware',
            status: 'DONE',
            priority: 'HIGH',
            storyPoints: 5,
            projectId: project.id,
            sprintId: sprint.id,
            assigneeId: user.id,
            organizationId: org.id,
          },
          {
            title: 'Build drag-and-drop Kanban board',
            status: 'IN_PROGRESS',
            priority: 'URGENT',
            storyPoints: 8,
            projectId: project.id,
            sprintId: sprint.id,
            assigneeId: user.id,
            organizationId: org.id,
          },
          {
            title: 'Configure Stripe subscription webhooks',
            status: 'TODO',
            priority: 'MEDIUM',
            storyPoints: 5,
            projectId: project.id,
            sprintId: sprint.id,
            organizationId: org.id,
          },
          {
            title: 'Audit role permissions for invited members',
            status: 'TODO',
            priority: 'LOW',
            storyPoints: 3,
            projectId: project.id,
            sprintId: null, // Backlog item
            organizationId: org.id,
          },
        ],
      });
    }

    const updatedMemberships = await prisma.organizationMember.findMany({
      where: { userId: user.id },
      include: { organization: true },
      orderBy: { organization: { createdAt: 'asc' } },
    });

    return NextResponse.json({
      user,
      organizations: updatedMemberships.map((m) => ({ ...m.organization, role: m.role })),
    });
  } catch (err) {
    console.error('Auth error:', err);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
