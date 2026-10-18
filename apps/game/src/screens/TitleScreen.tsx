import { texts } from '../texts.ts';

interface Props {
  onNewGame: () => void;
  onContinue: () => void;
}

export function TitleScreen({ onNewGame, onContinue }: Props) {
  return (
    <main className="screen title-screen">
      <div className="title-block">
        <img className="title-logo" src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" />
        <h1 className="game-title">{texts.app.name}</h1>
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
