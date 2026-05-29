import { normalizeUzbekPhone } from '../telegram/phoneUtils.js'

const cases = [
  { input: '+998500906385', expected: '+998500906385' },
  { input: '998500906385', expected: '+998500906385' },
  { input: '90 123 45 67', expected: '+998901234567' },
  { input: '+998 90 123 45 67', expected: '+998901234567' },
  { input: '(90)1234567', expected: '+998901234567' },
  { input: '0901234567', expected: '+998901234567' },
  { input: '00998901234567', expected: '+998901234567' },
  { input: '+998-90-123-45-67', expected: '+998901234567' },
]

let failed = 0
for (const { input, expected } of cases) {
  try {
    const actual = normalizeUzbekPhone(input)
    if (actual !== expected) {
      console.error(`FAIL: ${input} => ${actual} (expected ${expected})`)
      failed += 1
    } else {
      console.log(`PASS: ${input} => ${actual}`)
    }
  } catch (err) {
    console.error(`ERROR: ${input} => ${err.message}`)
    failed += 1
  }
}
if (failed > 0) {
  process.exit(1)
}
