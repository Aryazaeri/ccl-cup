import type { Match, MatchSquadPlayer, Player } from '../types'
import { squadOf } from '../lib/squadUtils'

export function MatchLineupFields({ match, players, value, onChange }: {
  match: Match; players: Player[]; value: MatchSquadPlayer[]; onChange: (rows: MatchSquadPlayer[]) => void
}) {
  const locked = !!match.startedAt
  return <fieldset className="span-2 match-lineup-fields">
    <legend>Match-day starters and substitutes</legend>
    <p className="field-hint">Review the club default for this match. Six to eight starters per side, including one goalkeeper. Lineups lock at kickoff. Suspended players must be excluded.</p>
    {[{ id: match.homeTeamId, name: match.home }, { id: match.awayTeamId, name: match.away }].map((side) => <section key={side.id}>
      <h3>{side.name}</h3>
      <div className="table-scroll"><table className="admin-table"><thead><tr><th>Player</th><th>Selection</th><th>Goalkeeper</th></tr></thead><tbody>
        {squadOf(players, side.id ?? -1).map((p) => {
          const entry = value.find((r) => r.playerId === p.id && r.teamId === side.id)
          const update = (role: string, keeper = entry?.isGoalkeeper ?? false) => onChange([
            ...value.filter((r) => r.playerId !== p.id),
            ...(role ? [{ teamId: side.id!, playerId: p.id, playerName: p.fullName, shirtNumber: p.shirtNumber,
              lineupRole: role as 'starter' | 'bench', isGoalkeeper: role === 'starter' && keeper }] : []),
          ])
          return <tr key={p.id}><td>{p.fullName}</td><td><select disabled={locked} aria-label={`Match selection for ${p.fullName}`}
            value={entry?.lineupRole ?? ''} onChange={(e) => update(e.target.value)}>
            <option value="">Not selected</option><option value="starter">Starter</option><option value="bench">Substitute</option>
          </select></td><td><input type="checkbox" disabled={locked || entry?.lineupRole !== 'starter'}
            aria-label={`${p.fullName} starts in goal`} checked={entry?.isGoalkeeper ?? false}
            onChange={(e) => update(entry?.lineupRole ?? '', e.target.checked)} /></td></tr>
        })}
      </tbody></table></div>
    </section>)}
    {locked && <p className="field-hint">The recorded selection is locked. Historical roster snapshots are retained without inventing starter assignments.</p>}
  </fieldset>
}
