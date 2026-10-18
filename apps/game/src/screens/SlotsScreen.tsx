import type { GameState } from '@cle/engine';
import { useEffect, useRef, useState } from 'react';
import { importGame } from '../storage/files.ts';
import { listSlots, SLOT_IDS, type SlotId, type SlotRecord } from '../storage/saves.ts';
import { format, formatGameDate, formatGameTime, formatRealTimestamp, texts } from '../texts.ts';

interface Props {
  mode: 'new' | 'continue';
  onNewGame: (slot: SlotId) => void;
  onLoad: (slot: SlotId) => void;
  onImport: (slot: SlotId, state: GameState) => void;
  onBack: () => void;
  notify: (message: string) => void;
}

export function SlotsScreen({ mode, onNewGame, onLoad, onImport, onBack, notify }: Props) {
  const [slots, setSlots] = useState<Map<SlotId, SlotRecord> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importTarget = useRef<SlotId>(1);

  useEffect(() => {
    listSlots()
      .then(setSlots)
      .catch(() => {
        setSlots(new Map());
        notify(texts.errors.storageUnavailable);
      });
  }, [notify]);

  const confirmOverwrite = (slot: SlotId) =>
    !slots?.has(slot) || window.confirm(format(texts.slots.confirmOverwrite, { number: slot }));

  const startImport = (slot: SlotId) => {
    if (!confirmOverwrite(slot)) return;
    importTarget.current = slot;
    fileInput.current?.click();
  };

  const onFileChosen = async (file: File | undefined) => {
    if (!file) return;
    try {
      onImport(importTarget.current, await importGame(file));
    } catch {
      notify(texts.errors.importFailed);
    }
  };

  return (
    <main className="screen">
      <h1 className="screen-heading">
        {mode === 'new' ? texts.slots.newGameHeading : texts.slots.continueHeading}
      </h1>
      <ul className="slot-list">
        {SLOT_IDS.map((slot) => {
          const record = slots?.get(slot);
          return (
            <li key={slot} className="card slot" data-testid={`slot-${slot}`}>
              <div className="slot-info">
                <h2 className="slot-title">{format(texts.slots.slotLabel, { number: slot })}</h2>
                {record ? (
                  <>
                    <p>
                      {format(texts.slots.gameDate, {
                        date: formatGameDate(record.gameDate),
                        time: formatGameTime(record.gameHour),
                      })}
                    </p>
                    <p className="muted">{formatRealTimestamp(record.savedAt)}</p>
                  </>
                ) : (
                  <p className="muted">{texts.slots.empty}</p>
                )}
              </div>
              <div className="slot-actions">
                {mode === 'new' ? (
                  <button
                    type="button"
                    className="button primary"
                    disabled={!slots}
                    onClick={() => confirmOverwrite(slot) && onNewGame(slot)}
                  >
                    {texts.slots.start}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="button primary"
                      disabled={!record}
                      onClick={() => onLoad(slot)}
                    >
                      {texts.slots.load}
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={!slots}
                      onClick={() => startImport(slot)}
                    >
                      {texts.slots.import}
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          void onFileChosen(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <button type="button" className="button" onClick={onBack}>
        {texts.slots.back}
      </button>
    </main>
  );
}
