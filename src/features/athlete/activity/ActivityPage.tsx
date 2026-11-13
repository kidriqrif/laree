import { useParams } from 'react-router'
import { ActivityDetail } from '../../shared/activity/ActivityDetail.tsx'

/** A8. The shared activity view, for the athlete. */
export default function ActivityPage() {
  const { activityId = '' } = useParams()
  return <ActivityDetail activityId={activityId} viewer="athlete" />
}
