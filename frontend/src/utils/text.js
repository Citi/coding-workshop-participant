// Small text helpers shared by every page.

/** countLabel(1, 'project') -> '1 project'; countLabel(3, 'project') -> '3 projects'. */
export function countLabel(count, noun, pluralNoun = `${noun}s`) {
  const value = Number(count) || 0
  return `${value} ${value === 1 ? noun : pluralNoun}`
}
