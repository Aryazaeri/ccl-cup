import { useAdminLanguage } from '../i18n/AdminLanguageContext'
import type { Match, MatchSquadPlayer, Player } from '../types'
import { squadOf } from '../lib/squadUtils'

export function MatchLineupFields({ match, players, value, onChange }: {
  match: Match; players: Player[]; value: MatchSquadPlayer[]; onChange: (rows: MatchSquadPlayer[]) => void
}) {
  const { tr } = useAdminLanguage()
  const locked = !!match.startedAt
  return <fieldset className="span-2 match-lineup-fields">
    <legend>{tr("Match-day starters and substitutes")}</legend>
    <p className="field-hint">{tr("Review the club default for this match. Six to eight starters per side, including one goalkeeper. Lineups lock at kickoff. Suspended players must be excluded.")}</p>
    {[{ id: match.homeTeamId, name: match.home }, { id: match.awayTeamId, name: match.away }].map((side) => <section key={side.id}>
      <h3>{side.name}</h3>
      <div className="table-scroll"><table className="admin-table"><thead><tr><th>{tr("Player")}</th><th>{tr("Selection")}</th><th>{tr("Goalkeeper")}</th></tr></thead><tbody>
        {squadOf(players, side.id ?? -1).map((p) => {
          const entry = value.find((r) => r.playerId === p.id && r.teamId === side.id)
          const update = (role: string, keeper = entry?.isGoalkeeper ?? false) => onChange([
            ...value.filter((r) => r.playerId !== p.id),
            ...(role ? [{ teamId: side.id!, playerId: p.id, playerName: p.fullName, shirtNumber: p.shirtNumber,
              lineupRole: role as 'starter' | 'bench', isGoalkeeper: role === 'starter' && keeper }] : []),
          ])
          return <tr key={p.id}><td>{p.fullName}</td><td><select disabled={locked} aria-label={tr("Match selection for {value0}", { value0: p.fullName })}
            value={entry?.lineupRole ?? ''} onChange={(e) => update(e.target.value)}>
            <option value="">{tr("Not selected")}</option><option value="starter">{tr("Starter")}</option><option value="bench">{tr("Substitute")}</option>
          </select></td><td><input type="checkbox" disabled={locked || entry?.lineupRole !== 'starter'}
            aria-label={tr("{value0} starts in goal", { value0: p.fullName })} checked={entry?.isGoalkeeper ?? false}
            onChange={(e) => update(entry?.lineupRole ?? '', e.target.checked)} /></td></tr>
        })}
      </tbody></table></div>
    </section>)}
    {locked && <p className="field-hint">{tr("The recorded selection is locked. Historical roster snapshots are retained without inventing starter assignments.")}</p>}
  </fieldset>
}
