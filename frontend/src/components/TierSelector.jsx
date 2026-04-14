const TIERS = ['S', 'A', 'B', 'C', 'D']

export default function TierSelector({ tier, onChange }) {
  function handleChange(e) {
    onChange(e.target.value || null)
  }

  return (
    <select value={tier ?? ''} onChange={handleChange}>
      <option value=""></option>
      {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
    </select>
  )
}
