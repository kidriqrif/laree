import type { ComponentType } from 'react'
import { createHashRouter, redirect, type RouteObject } from 'react-router'
import { AppFrame, StandaloneFrame } from './AppFrame.tsx'
import { AthleteShell } from './AthleteShell.tsx'
import { NotFound, type NotFoundScope } from './NotFound.tsx'
import { RolePicker } from './RolePicker.tsx'
import { RootError, RouteError } from './RouteError.tsx'

type Loader = () => Promise<{ default: ComponentType }>

/** Every page module loads on demand, so the athlete entry stays small. */
const page =
  (load: Loader) =>
  async (): Promise<{ Component: ComponentType }> => ({ Component: (await load()).default })

const title = (t: string) => ({ title: t })

/** A crashed page renders its error inside this layer, so the frame or shell around it keeps working. */
const guarded = (scope: NotFoundScope, children: RouteObject[]): RouteObject[] => [
  { errorElement: <RouteError scope={scope} />, children },
]

const athleteRoutes: RouteObject[] = [
  { index: true, loader: () => redirect('/athlete/today') },
  { path: 'today', lazy: page(() => import('../features/athlete/today/TodayPage.tsx')), handle: title('Today') },
  { path: 'week', lazy: page(() => import('../features/athlete/week/WeekPage.tsx')), handle: title('Week') },
  { path: 'progress', lazy: page(() => import('../features/athlete/progress/ProgressPage.tsx')), handle: title('Progress') },
  { path: 'me', lazy: page(() => import('../features/athlete/me/MePage.tsx')), handle: title('Me') },
  {
    path: 'workout/:workoutId',
    lazy: page(() => import('../features/athlete/workout/WorkoutPage.tsx')),
    handle: title('Workout'),
  },
  {
    path: 'activity/:activityId',
    lazy: page(() => import('../features/athlete/activity/ActivityPage.tsx')),
    handle: title('Activity'),
  },
  { path: '*', element: <NotFound scope="athlete" />, handle: title('Not found') },
]

const coachRoutes: RouteObject[] = [
  { index: true, loader: () => redirect('/coach/overview') },
  { path: 'overview', lazy: page(() => import('../features/coach/overview/OverviewPage.tsx')), handle: title('Overview') },
  {
    path: 'athlete/:athleteId',
    lazy: page(() => import('../features/coach/athlete/AthletePage.tsx')),
    handle: title('Athlete'),
  },
  {
    path: 'calendar/:athleteId?',
    lazy: page(() => import('../features/coach/calendar/CalendarPage.tsx')),
    handle: title('Calendar'),
  },
  {
    path: 'season/:athleteId?',
    lazy: page(() => import('../features/coach/season/SeasonPage.tsx')),
    handle: title('Season'),
  },
  {
    path: 'analytics/:athleteId?',
    lazy: page(() => import('../features/coach/analytics/AnalyticsPage.tsx')),
    handle: title('Analytics'),
  },
  { path: 'library', lazy: page(() => import('../features/coach/library/LibraryPage.tsx')), handle: title('Library') },
  {
    path: 'library/:workoutId',
    lazy: page(() => import('../features/coach/builder/BuilderPage.tsx')),
    handle: title('Workout builder'),
  },
  { path: 'check-ins', lazy: page(() => import('../features/coach/check-ins/CheckInsPage.tsx')), handle: title('Check-ins') },
  {
    path: 'activity/:activityId',
    lazy: page(() => import('../features/coach/activity/ActivityPage.tsx')),
    handle: title('Activity'),
  },
  { path: 'settings', lazy: page(() => import('../features/coach/settings/SettingsPage.tsx')), handle: title('Settings') },
  { path: '*', element: <NotFound scope="coach" />, handle: title('Not found') },
]

/** The whole route table (IA section 3.1). Feature tasks replace page files, never this table. */
export const routes: RouteObject[] = [
  {
    element: <AppFrame />,
    errorElement: <RootError />,
    children: [
      {
        element: <StandaloneFrame />,
        children: guarded('standalone', [
          { index: true, element: <RolePicker />, handle: title('Role picker') },
          { path: 'brand', lazy: page(() => import('../features/shared/brand/BrandPage.tsx')), handle: title('Brand board') },
          { path: 'kit', lazy: page(() => import('../features/shared/kit/KitPage.tsx')), handle: title('UI kit') },
          { path: 'reset', lazy: page(() => import('../features/shared/reset/ResetPage.tsx')), handle: title('Reset demo data') },
          { path: '*', element: <NotFound scope="standalone" />, handle: title('Not found') },
        ]),
      },
      { path: 'athlete', element: <AthleteShell />, children: guarded('athlete', athleteRoutes) },
      {
        path: 'coach',
        // The coach shell is a separate chunk: athletes never download it.
        lazy: async () => ({ Component: (await import('./CoachShell.tsx')).default }),
        children: guarded('coach', coachRoutes),
      },
    ],
  },
]

export const createAppRouter = () => createHashRouter(routes)
