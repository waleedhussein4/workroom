import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { can, isRole } from '@workroom/core'
import { getDb, invitation, member, user } from '@workroom/db'
import { NotFoundError, requireWorkspaceBySlug } from '@/server/guard'
import { MembersTable } from '@/components/workspace/members-table'
import { InviteForm } from '@/components/workspace/invite-form'

export const metadata: Metadata = { title: 'Members' }

export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let context
  try {
    context = await requireWorkspaceBySlug(slug)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const db = getDb()
  const [members, pending] = await Promise.all([
    db
      .select({
        memberId: member.id,
        role: member.role,
        createdAt: member.createdAt,
        userId: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, context.organizationId))
      .orderBy(asc(user.name)),
    can(context.role, 'member:invite')
      ? db
          .select({
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            status: invitation.status,
            expiresAt: invitation.expiresAt,
          })
          .from(invitation)
          .where(eq(invitation.organizationId, context.organizationId))
      : Promise.resolve([]),
  ])

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div>
        <h1 className="text-foreground text-xl font-semibold tracking-tight">Members</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Roles decide what people can change. Every check happens on the server.
        </p>
      </div>

      {can(context.role, 'member:invite') ? (
        <div className="mt-8">
          <InviteForm organizationId={context.organizationId} />
        </div>
      ) : null}

      <MembersTable
        organizationId={context.organizationId}
        currentUserId={context.user.id}
        currentRole={context.role}
        members={members.map((row) => ({
          memberId: row.memberId,
          userId: row.userId,
          name: row.name,
          email: row.email,
          image: row.image,
          role: isRole(row.role) ? row.role : 'member',
        }))}
      />

      {pending.filter((row) => row.status === 'pending').length > 0 ? (
        <div className="mt-10">
          <h2 className="text-foreground text-sm font-medium">Pending invitations</h2>
          <ul className="border-border mt-3 divide-y rounded-lg border">
            {pending
              .filter((row) => row.status === 'pending')
              .map((row) => (
                <li key={row.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-foreground text-sm">{row.email}</span>
                  <span className="text-muted-foreground text-xs capitalize">
                    {row.role ?? 'member'}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
