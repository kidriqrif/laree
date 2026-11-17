import { describe, expect, it } from 'vitest'
import { checkOutput, facts, marks, safeBaseUrl, sameFacts } from './check.ts'

const draft = { headline: 'A steady week', lines: ['You ran 12 km in 60 minutes.', 'Sleep was 7.5 h on 3 of 4 nights.'] }
const answer = (headline: string, ...lines: string[]) => JSON.stringify({ headline, lines })

describe('the check on a provider answer', () => {
  it('accepts a rewording that keeps every line\'s numbers with their units', () => {
    expect(checkOutput(answer('Steady week', 'In 60 min you ran 12 km.', 'Sleep was 7.5 h on 3 of 4 nights.'), draft)).not.toBeNull()
  })

  it('wants "3 of 4" back word for word: two plain counts could be swapped unseen', () => {
    expect(checkOutput(answer('Steady week', 'You ran 12 km in 60 minutes.', 'You slept 7.5 hours on 3 of 4 nights.'), draft)).toBeNull()
    expect(checkOutput(answer('Steady week', 'You ran 12 km in 60 minutes.', 'Sleep was 7.5 h on 4 of 3 nights.'), draft)).toBeNull()
  })

  it('refuses numbers swapped between facts', () => {
    // Both numbers are in the draft's line, but not with these units.
    expect(checkOutput(answer('Steady week', 'You ran 60 km in 12 minutes.', 'Sleep was 7.5 h on 3 of 4 nights.'), draft)).toBeNull()
  })

  it('refuses a number that is not in the draft, and one that was dropped', () => {
    expect(checkOutput(answer('Steady week', 'You ran 13 km in 60 minutes.', 'Sleep was 7.5 h on 3 of 4 nights.'), draft)).toBeNull()
    expect(checkOutput(answer('Steady week', 'You ran 12 km.', 'Sleep was 7.5 h on 3 of 4 nights.'), draft)).toBeNull()
  })

  it('refuses a number moved to another line, and a different number of lines', () => {
    expect(checkOutput(answer('Steady week', 'Sleep was 7.5 h on 3 of 4 nights.', 'You ran 12 km in 60 minutes.'), draft)).toBeNull()
    expect(checkOutput(answer('Steady week', 'You ran 12 km in 60 minutes. Sleep was 7.5 h on 3 of 4 nights.'), draft)).toBeNull()
  })

  it('refuses a unit put on a plain count, and a count made from a measurement', () => {
    expect(checkOutput(answer('Steady week', 'You ran 12 km in 60 minutes.', 'Sleep was 7.5 h for 3 hours of 4 nights.'), draft)).toBeNull()
    expect(checkOutput(answer('Steady week', 'You ran 12 good km in 60 minutes.', 'Sleep was 7.5 h on 3 of 4 nights.'), draft)).toBeNull()
  })

  it('wants a line with two values of the same kind back word for word', () => {
    const hr = { headline: 'Heart rate', lines: ['Resting heart rate was 60 bpm and maximum heart rate was 180 bpm.'] }
    // The swapped line holds the same numbers with the same units: only the wording gives it away.
    expect(checkOutput(answer('Heart rate', 'Maximum heart rate was 60 bpm and resting heart rate was 180 bpm.'), hr)).toBeNull()
    expect(checkOutput(answer('Heart rate', 'Your resting heart rate was 60 bpm; your maximum was 180 bpm.'), hr)).toBeNull()
    expect(checkOutput(answer('Your heart rate', hr.lines[0] as string), hr)).not.toBeNull()
    // The same value twice is not two values.
    expect(sameFacts('You ran 5 km on Monday and 5 km on Friday.', 'You ran 5 km on Monday and 5 km on Friday too.')).toBe(true)
  })

  it('keeps what a number measures', () => {
    expect(sameFacts('Resting heart rate was 60 bpm.', 'Maximum heart rate was 60 bpm.')).toBe(false)
    expect(sameFacts('Resting HR 60 bpm.', 'Your heart rate at rest was 60 bpm.')).toBe(true)
    expect(sameFacts('Resting heart rate was 60 bpm.', 'Heart rate was 60 bpm.')).toBe(false)
    expect(sameFacts('Sleep was 7 h.', 'You slept 7 hours.')).toBe(true)
    expect(sameFacts('You ran 12 km.', 'You swam 12 km.')).toBe(false)
    expect(sameFacts('Load rose by 12%.', 'Load fell by 12%.')).toBe(false)
    expect(sameFacts('2 key sessions missed.', 'You missed 2 sessions.')).toBe(false)
    expect(sameFacts('Next week has no key sessions marked.', 'Last week had no key sessions.')).toBe(false)
    expect(sameFacts('Next week has no key sessions marked.', 'No key sessions are marked for next week.')).toBe(true)
    // A word after a number that is not its unit still counts: "3 runs" is not "3 rides".
    expect(marks('3 runs')).toEqual(['3|', 'run'])
    expect(sameFacts('You logged 3 runs.', 'You logged 3 rides.')).toBe(false)
  })

  it('keeps which describing word goes with which number when a line has several', () => {
    const line = 'Resting HR 52 bpm and sleep 7 h.'
    expect(sameFacts(line, 'Your resting HR was 52 bpm and sleep 7 h.')).toBe(true)
    // Between two numbers the text stays as written: "sleep" could go with either number.
    expect(sameFacts(line, 'Your resting HR was 52 bpm and you slept 7 h.')).toBe(false)
    // The same numbers and words, but the words now name the other number.
    expect(sameFacts(line, 'Sleep 52 bpm and resting HR 7 h.')).toBe(false)
    // A single value: the words before it and after it stay where they are.
    expect(
      sameFacts(
        'Resting heart rate was 60 bpm; maximum heart rate was not recorded.',
        'Maximum heart rate was 60 bpm; resting heart rate was not recorded.',
      ),
    ).toBe(false)
    expect(
      sameFacts(
        'Resting heart rate was 60 bpm; maximum heart rate was not recorded.',
        'Your heart rate at rest was 60 bpm. Maximum heart rate was not recorded.',
      ),
    ).toBe(true)
    // Between two numbers, words keep their order: each could go with either number.
    expect(sameFacts('5 km on Monday; Friday: 30 min.', '5 km on Friday; Monday: 30 min.')).toBe(false)
    expect(sameFacts('5 km on Monday; Friday: 30 min.', '5 km; Monday and Friday: 30 min.')).toBe(false)
    expect(sameFacts('5 km on Monday; Friday: 30 min.', 'You did 5 km on Monday; Friday: 30 min.')).toBe(true)
    // Two days and one value each side: a day cannot move to the other value.
    expect(sameFacts('5 km on Monday and 8 km on Friday.', '5 km on Friday and 8 km on Monday.')).toBe(false)
    // One describing word cannot be swapped with anything: the order may change.
    expect(sameFacts('You ran 12 km in 60 minutes.', 'In 60 minutes you ran 12 km.')).toBe(true)
  })

  it('refuses a word the draft does not have unless it is neutral', () => {
    // The relationship changed, though every number and describing word stayed.
    expect(sameFacts('Resting HR 60 bpm (baseline 50).', 'Resting HR exceeded 60 bpm (baseline 50).')).toBe(false)
    expect(sameFacts('Resting HR 60 bpm (baseline 50).', 'Your resting HR was 60 bpm (baseline 50).')).toBe(true)
    // Judgement and hedging are new claims too.
    expect(sameFacts('You ran 12 km.', 'You ran a great 12 km.')).toBe(false)
    expect(sameFacts('You ran 12 km.', 'You ran only 12 km.')).toBe(false)
    // Bounds and estimates, times, advice and causes are claims the draft does not make.
    for (const added of ['over', 'under', 'about', 'around', 'within', 'nearly']) {
      expect(sameFacts('You ran 12 km.', `You ran ${added} 12 km.`)).toBe(false)
    }
    expect(sameFacts('Load changed by -12%.', 'Your load changed by -12% this week.')).toBe(false)
    expect(sameFacts('Load changed by -12%.', 'Load changed by -12% before the race.')).toBe(false)
    expect(sameFacts('You ran 12 km.', 'You ran 12 km, so you should rest.')).toBe(false)
    expect(sameFacts('You ran 5 km on Monday and Friday.', 'You ran 5 km each on Monday and Friday.')).toBe(false)
    // Words of the draft cannot be dropped either: a name, a session, a "missed".
    expect(sameFacts('Boston Marathon is in 3 weeks.', 'Marathon is in 3 weeks.')).toBe(false)
    expect(sameFacts('Boston Marathon is in 3 weeks.', 'The Boston Marathon is in 3 weeks.')).toBe(true)
    expect(sameFacts('2 key sessions missed.', '2 sessions.')).toBe(false)
    // Grammar words may go.
    expect(sameFacts('Sleep was 7 h.', 'Sleep: 7 h.')).toBe(true)
    // A plural or past form of the draft's own word is the same word.
    expect(sameFacts('Next week has no key sessions marked.', 'No key session is marked for next week.')).toBe(true)
  })

  it('keeps the sign of a number', () => {
    const load = { headline: 'Load', lines: ['Load changed by -12%.'] }
    expect(checkOutput(answer('Load', 'Your load changed by +12%.'), load)).toBeNull()
    expect(checkOutput(answer('Load', 'Your load changed by 12%.'), load)).toBeNull()
    expect(checkOutput(answer('Load', 'Your load changed by \u221212%.'), load)).not.toBeNull()
    // A hyphen inside a range is not a sign.
    expect(facts('Zones 10-12 and Z2')).toEqual(['10|', '12|', '2|'])
    expect(facts('-12% and +3 km')).toEqual(['-12|%', '3|km'])
  })

  it('reads a decimal comma and a time as one number', () => {
    expect(facts('7,5 h at 5:30 pace')).toEqual(['7.5|h', '5:30|'])
    expect(sameFacts('Sleep was 7.5 h.', 'You slept 7,5 hours.')).toBe(true)
  })

  it('refuses anything that is not the asked-for shape', () => {
    const one = { headline: 'Steady week', lines: ['You ran 12 km.'] }
    expect(checkOutput('not json', one)).toBeNull()
    expect(checkOutput('null', one)).toBeNull()
    expect(checkOutput(answer('', 'You ran 12 km.'), one)).toBeNull()
    expect(checkOutput(JSON.stringify({ headline: 'Fine', lines: [] }), one)).toBeNull()
    expect(checkOutput('```json\n' + answer('A steady week', 'A 12 km run.') + '\n```', one)).not.toBeNull()
  })
})

describe('a provider address', () => {
  it('must be HTTPS', () => {
    expect(safeBaseUrl('https://openrouter.ai/api/v1', false)).toBe(true)
    expect(safeBaseUrl('http://openrouter.ai/api/v1', false)).toBe(false)
    expect(safeBaseUrl('http://openrouter.ai/api/v1', true)).toBe(false)
    expect(safeBaseUrl('ftp://example.com', true)).toBe(false)
    expect(safeBaseUrl('not a url', true)).toBe(false)
  })

  it('may be plain HTTP only for a mock on this machine, and only when switched on', () => {
    expect(safeBaseUrl('http://localhost:8787/v1', false)).toBe(false)
    expect(safeBaseUrl('http://localhost:8787/v1', true)).toBe(true)
    expect(safeBaseUrl('http://127.0.0.1:8787/v1', true)).toBe(true)
    expect(safeBaseUrl('http://localhost.example.com/v1', true)).toBe(false)
  })
})
