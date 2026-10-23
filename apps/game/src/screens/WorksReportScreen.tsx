import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { propertyLabel, t } from '../texts.ts';
import { Empty, ScreenHeader } from '../ui/components.tsx';
import { WorksBeforeAfterView } from '../ui/WorksBeforeAfter.tsx';

/** « Avant / après » of the last works of a property (game feel, lot 4). */
export function WorksReportScreen({ id }: { id: string }) {
  const { state } = useGame();
  const nav = useNav();
  const owned = state.properties.find((candidate) => candidate.property.id === id);
  const report = owned ? engine.worksBeforeAfter(state, id) : null;
  return (
    <div className="screen">
      <ScreenHeader title={t.worksReport.heading} onBack={nav.pop} />
      {owned && <p className="muted small">{propertyLabel(owned.property)}</p>}
      {report ? (
        <WorksBeforeAfterView propertyId={id} />
      ) : (
        <Empty icon="info">{t.worksReport.noPicture}</Empty>
      )}
    </div>
  );
}
