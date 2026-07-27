import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createClient } from '@/lib/supabase/server'
import { computeUserTypeFlags } from '@/lib/userClassification'

interface LinkedPatient {
  id: string
  name: string | null
  email: string | null
  relationship: string | null
}

interface ContactRow {
  id: string
  patient_id: string | null
  name: string | null
  relationship: string | null
  email: string | null
  phone: string | null
  contact_user_id: string | null
}

/** Last 10 digits of a phone number, for country-code-agnostic matching. */
function last10(phone?: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : null
}

/**
 * GET /api/admin/users/[userId]/classification
 *
 * Returns the authoritative user-type flags for a single account plus, for
 * accounts that are emergency contacts, the patient(s) they are listed under.
 *
 * Emergency-contact linkage is matched the same way the mobile "I'm a Contact
 * For" view matches it: the maintained contact_user_id link, an email match, or
 * a last-10-digits phone match — so the admin sees the same relationships.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const { userId } = await params
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const supabase = createClient()

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, phone, role, account_type')
      .eq('id', userId)
      .maybeSingle()

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 500 })
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Collect the contact rows that name this account, from all three signals.
    // The emergency_contacts table is small; a few small queries unioned in JS
    // is simpler and safer than composing an escaped PostgREST or() over an
    // email that may contain '.' / '+'.
    const contactsById = new Map<string, ContactRow>()
    const addRows = (rows: ContactRow[] | null) => {
      for (const r of rows || []) contactsById.set(r.id, r)
    }

    const linkQ = await supabase
      .from('emergency_contacts')
      .select('id, patient_id, name, relationship, email, phone, contact_user_id')
      .eq('contact_user_id', userId)
    addRows(linkQ.data as ContactRow[] | null)

    if (user.email) {
      const emailQ = await supabase
        .from('emergency_contacts')
        .select('id, patient_id, name, relationship, email, phone, contact_user_id')
        .ilike('email', user.email)
      addRows(emailQ.data as ContactRow[] | null)
    }

    const phone10 = last10(user.phone)
    if (phone10) {
      const phoneQ = await supabase
        .from('emergency_contacts')
        .select('id, patient_id, name, relationship, email, phone, contact_user_id')
        .ilike('phone', `%${phone10}%`)
      // Guard the ilike-substring match down to an exact last-10 comparison.
      addRows(
        ((phoneQ.data as ContactRow[] | null) || []).filter(
          (r) => last10(r.phone) === phone10
        )
      )
    }

    const contactRows = Array.from(contactsById.values())

    const flags = computeUserTypeFlags({
      role: user.role,
      account_type: user.account_type,
      isEmergencyContactLinked: contactRows.length > 0,
    })

    // Resolve the owning patient for each contact row. emergency_contacts.patient_id
    // references patients.user_id, which IS the owner's users.id.
    let linkedPatients: LinkedPatient[] = []
    const ownerIds = Array.from(
      new Set(contactRows.map((r) => r.patient_id).filter(Boolean))
    ) as string[]

    if (ownerIds.length > 0) {
      const { data: owners } = await supabase
        .from('users')
        .select('id, full_name, email')
        .in('id', ownerIds)

      const ownerById = new Map((owners || []).map((o) => [o.id, o]))
      // Keep the relationship label from one contact row per owner.
      const relByOwner = new Map<string, string | null>()
      for (const r of contactRows) {
        if (r.patient_id && !relByOwner.has(r.patient_id)) {
          relByOwner.set(r.patient_id, r.relationship ?? null)
        }
      }

      linkedPatients = ownerIds.map((oid) => {
        const o = ownerById.get(oid)
        return {
          id: oid,
          name: o?.full_name ?? null,
          email: o?.email ?? null,
          relationship: relByOwner.get(oid) ?? null,
        }
      })
    }

    return NextResponse.json({
      is_patient: flags.is_patient,
      is_emergency_contact: flags.is_emergency_contact,
      account_type: user.account_type ?? 'patient',
      linked_patients: linkedPatients,
    })
  } catch (error: any) {
    console.error('Error classifying user:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to classify user' },
      { status: 500 }
    )
  }
}
