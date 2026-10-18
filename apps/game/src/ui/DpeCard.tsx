import type { Property } from '@cle/engine';
import { engine } from '../engine.ts';
import { useGame } from '../game/context.tsx';
import { format, formatDayLong, t } from '../texts.ts';
import { Card, DpeBar, DpeLetter } from './components.tsx';

/**
 * Energy class and what it means for letting (docs/03-systemes/04, DPE).
 * `id`: the listing, purchase or owned property, as the engine's queries take it.
 */
export function DpeCard({ property, id }: { property: Property; id: string }) {
  const { state } = useGame();
  const quote = engine.rentQuote(state, id, 'bare');
  let text: string = t.listing.dpeOk;
  if (quote?.block === 'rent.indecent') text = t.listing.indecent;
  else if (quote?.banDay !== null && quote?.banDay !== undefined) {
    const date = formatDayLong(quote.banDay);
    text =
      quote.block === 'rent.dpeBanned'
        ? format(t.listing.dpeBanned, { date })
        : format(t.listing.dpeBanFuture, { date });
  }
  const tone = quote?.block ? 'negative' : quote?.banDay ? 'warning' : '';
  return (
    <Card title={t.listing.dpe} aside={<DpeLetter dpe={property.dpe} />}>
      <DpeBar dpe={property.dpe} />
      <p className={`small ${tone}`}>
        {format(t.listing.dpeClass, { dpe: property.dpe })} · {text}
      </p>
    </Card>
  );
}
