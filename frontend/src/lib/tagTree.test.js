import { describe, it, expect } from 'vitest'
import { buildTagTree, getDescendantIds, findNode } from './tagTree'

const FLAT = [
  { id: 'a', name: 'Genre', parent_tag_id: null, position: 0 },
  { id: 'b', name: 'Rock', parent_tag_id: 'a', position: 1 },
  { id: 'c', name: 'Jazz', parent_tag_id: 'a', position: 0 },
  { id: 'd', name: 'Mood', parent_tag_id: null, position: 1 },
  { id: 'e', name: 'Bebop', parent_tag_id: 'c', position: 0 },
]

describe('buildTagTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildTagTree([])).toEqual([])
  })

  it('nests children under parents', () => {
    const tree = buildTagTree(FLAT)
    expect(tree).toHaveLength(2)
    const genre = tree.find((n) => n.id === 'a')
    expect(genre.children.map((n) => n.id)).toEqual(['c', 'b'])
  })

  it('sorts siblings by position recursively', () => {
    const tree = buildTagTree(FLAT)
    expect(tree.map((n) => n.id)).toEqual(['a', 'd'])
    const jazz = tree[0].children.find((n) => n.id === 'c')
    expect(jazz.children.map((n) => n.id)).toEqual(['e'])
  })

  it('treats orphans (missing parent) as roots', () => {
    const orphans = [{ id: 'x', name: 'X', parent_tag_id: 'missing', position: 0 }]
    const tree = buildTagTree(orphans)
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe('x')
  })
})

describe('findNode', () => {
  it('finds a root node', () => {
    const tree = buildTagTree(FLAT)
    expect(findNode(tree, 'a').name).toBe('Genre')
  })

  it('finds a deeply nested node', () => {
    const tree = buildTagTree(FLAT)
    expect(findNode(tree, 'e').name).toBe('Bebop')
  })

  it('returns null for missing id', () => {
    expect(findNode(buildTagTree(FLAT), 'zzz')).toBeNull()
  })
})

describe('getDescendantIds', () => {
  it('returns set with the node and all descendants', () => {
    const tree = buildTagTree(FLAT)
    const ids = getDescendantIds(tree, 'a')
    expect(ids).toEqual(new Set(['a', 'b', 'c', 'e']))
  })

  it('returns just the node id when leaf', () => {
    const tree = buildTagTree(FLAT)
    expect(getDescendantIds(tree, 'e')).toEqual(new Set(['e']))
  })

  it('returns empty set for missing id', () => {
    const tree = buildTagTree(FLAT)
    expect(getDescendantIds(tree, 'zzz')).toEqual(new Set())
  })
})
