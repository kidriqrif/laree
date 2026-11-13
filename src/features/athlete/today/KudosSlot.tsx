import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { currentDay } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import type { AthleteId, Kudos } from '../../../domain/types.ts'
import { Card } from '../../../ui/core/index.ts'

function when(days: number): string {
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

/** The newest unseen kudos from Coach, as a small card. Nothing when there is none. */
export function KudosSlot({ athleteId }: { athleteId: AthleteId }) {
  const kudos = useLaree((s) => s.data.kudos)
  // Newest by day; on a tie the one sent last wins.
  const latest = kudos
    .filter((k) => k.athleteId === athleteId && !k.seenByAthlete)
    .reduce<Kudos | undefined>((best, k) => (best === undefined || k.day >= best.day ? k : best), undefined)
  // Fixed for this visit: the card stays after it is marked seen. Kudos already waiting when the
  // page opened are not swapped in later; kudos that arrive while it is open are.
  const [card, setCard] = useState<Kudos | undefined>(latest)
  const [known, setKnown] = useState<string[]>(() => kudos.filter((k) => !k.seenByAthlete).map((k) => k.id))
  if (latest && !known.includes(latest.id)) {
    setKnown([...known, latest.id])
    setCard(latest)
  }
  const markSeen = useLaree((s) => s.markKudosSeen)
  const activity = useLaree((s) => (card?.activityId ? s.data.activities.find((a) => a.id === card.activityId) : undefined))
  const cardId = card?.id
  useEffect(() => {
    if (cardId) markSeen(athleteId, [cardId])
  }, [cardId, athleteId, markSeen])
  if (!card) return null
  return (
    <Card as="section" aria-label="New from Coach">
      <h2 style={{ margin: 0, fontSize: 'var(--text-base)' }}>New from Coach</h2>
      <p>{card.message ?? 'Nice work.'}</p>
      <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
        {activity ? <Link to={`/athlete/activity/${activity.id}`}>{activity.title}</Link> : 'This week'}
        {' · '}
        {when(currentDay() - card.day)}
      </p>
    </Card>
  )
}
