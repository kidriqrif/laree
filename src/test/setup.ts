import { configure } from '@testing-library/react'

// Lazy routes load their code on first render. On a busy machine or a small CI runner that takes
// far longer than the 1 s default, so findBy and waitFor wait longer before they give up.
configure({ asyncUtilTimeout: 25_000 })
