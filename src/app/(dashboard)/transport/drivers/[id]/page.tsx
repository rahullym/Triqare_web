import { redirect } from 'next/navigation'

/**
 * This route used to render a "Driver Details" screen built entirely from a
 * hard-coded `mockDriver` object — every driver id showed the same John Smith,
 * +1-555-0123, $28.50/hr, plus an Edit form whose Save only console.logged and a
 * Delete button that deleted nothing. Nothing in the app linked to it, so it was
 * reachable only by typing the URL, where it looked like real driver data.
 *
 * The real screen is the sibling /edit route, which reads and writes through
 * /api/transport/drivers/[id]. Redirect rather than delete so any bookmarked or
 * pasted link lands on the genuine record instead of a 404.
 */
export default async function TransportDriverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/transport/drivers/${id}/edit`)
}
