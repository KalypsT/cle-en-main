import { texts } from '../texts.ts';

/** Key and tag logo (docs/05-direction-artistique.md, 5.2), in two widths. */
const LOGO = `${import.meta.env.BASE_URL}logo/logo`;

interface Props {
  onNewGame: () => void;
  onContinue: () => void;
}

export function TitleScreen({ onNewGame, onContinue }: Props) {
  return (
    <main className="screen title-screen">
      <div className="title-block">
        <h1 className="game-title">
          <img
            className="title-logo"
            src={`${LOGO}-480.webp`}
            srcSet={`${LOGO}-480.webp 480w, ${LOGO}-960.webp 960w`}
            sizes="min(90vw, 360px)"
            width={480}
            height={261}
            alt={texts.app.name}
          />
        </h1>
        <p className="tagline">{texts.title.tagline}</p>
      </div>
      <div className="stack">
        <button type="button" className="button primary" onClick={onNewGame}>
          {texts.title.newGame}
        </button>
        <button type="button" className="button" onClick={onContinue}>
          {texts.title.continue}
        </button>
      </div>
    </main>
  );
}
